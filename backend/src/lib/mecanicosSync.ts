import type { Pool } from 'mysql2/promise';
import { DEFAULT_ROLE_PERMISSIONS } from './permissions';

/**
 * Perfis de usuários do sistema que atuam operacionalmente por padrão
 */
export const ROLES_COLABORADORES_OFICINA = ['mecanico', 'manager', 'operator'];

/**
 * Permissões do catálogo que qualificam um colaborador a operar na Oficina / Ordens de Serviço (Checklist).
 */
export const PERMISSOES_OPERACIONAIS_OFICINA = ['os_orders', 'oficina'];

/**
 * Sincroniza colaboradores do sistema (users) com a tabela cad_mecanicos e mecanico_tenants.
 * Considera:
 * 1. Usuários com perfil 'mecanico' (sempre vinculados à oficina).
 * 2. Usuários com perfis operacionais ('manager', 'operator').
 * 3. Qualquer usuário que possua permissões ativas para 'os_orders' (Ordens de Serviço) ou 'oficina'.
 * 4. Respeita a customização de permissões: se um usuário tem custom_permissions = 1,
 *    verifica se possui 'os_orders' ou 'oficina' concedidas.
 */
export async function syncColaboradoresToMecanicos(pool: Pool, targetUserId?: number): Promise<void> {
  try {
    const userFilter = targetUserId
      ? `AND u.id = ${Number(targetUserId)}`
      : `AND (
           u.role IN ('mecanico', 'manager', 'operator')
           OR EXISTS (SELECT 1 FROM cad_mecanicos cm WHERE cm.user_id = u.id)
           OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = u.id AND up.permission IN ('os_orders', 'oficina'))
         )`;

    const [users] = await pool.query<any>(`
      SELECT u.id, u.nome, u.email, u.tenant_id, u.ativo, u.role, u.custom_permissions,
             (SELECT GROUP_CONCAT(ut.tenant_id) FROM user_tenants ut WHERE ut.user_id = u.id) as tenant_ids_str,
             (SELECT GROUP_CONCAT(up.permission) FROM user_permissions up WHERE up.user_id = u.id) as custom_perms_str
      FROM users u
      WHERE 1=1 ${userFilter}
    `);

    const [[tenantCountRow]] = await pool.query<any>(
      'SELECT COUNT(*) as totalTenants FROM tenants WHERE ativo = 1'
    );
    const totalTenants = Number(tenantCountRow?.totalTenants || 0);

    for (const u of users) {
      // Determina se o usuário tem permissão para atuar na Oficina / Ordens de Serviço
      const isMecanico = u.role === 'mecanico';
      const isCustom = Boolean(u.custom_permissions);
      const customPerms = u.custom_perms_str ? String(u.custom_perms_str).split(',') : [];
      const rolePerms = DEFAULT_ROLE_PERMISSIONS[u.role] ?? [];
      const effectivePerms = isCustom ? customPerms : rolePerms;

      const hasWorkshopPerm = isMecanico ||
        u.role === 'owner' ||
        effectivePerms.includes('*') ||
        effectivePerms.includes('os_orders') ||
        effectivePerms.includes('oficina') ||
        ROLES_COLABORADORES_OFICINA.includes(u.role);

      const shouldBeAtivoNaOficina = Boolean(u.ativo) && hasWorkshopPerm;

      // Busca mecânico existente por user_id, por nome exato ou aproximação de nome caso ainda não vinculado
      const [existingRows] = await pool.query<any>(
        `SELECT id, tenant_id, ativo, todas_lojas, user_id, nome 
         FROM cad_mecanicos 
         WHERE user_id = ? 
            OR LOWER(TRIM(nome)) = LOWER(TRIM(?))
            OR (user_id IS NULL AND LOWER(TRIM(nome)) LIKE ?)
         ORDER BY (user_id = ?) DESC, id ASC`,
        [u.id, u.nome, `%${String(u.nome).trim().toLowerCase()}%`, u.id]
      );
      const existingMec = existingRows[0] || null;

      // Se não deve estar ativo na oficina
      if (!shouldBeAtivoNaOficina) {
        if (existingMec && existingMec.ativo) {
          await pool.query('UPDATE cad_mecanicos SET ativo = 0, updated_at = NOW() WHERE id = ?', [existingMec.id]);
        }
        continue;
      }

      // Lojas do usuário
      const tenantIdsFromStr = u.tenant_ids_str
        ? String(u.tenant_ids_str).split(',').map(Number).filter(Boolean)
        : [];
      const userTenants = Array.from(
        new Set([
          ...(u.tenant_id ? [Number(u.tenant_id)] : []),
          ...tenantIdsFromStr,
        ])
      ).filter(Boolean);

      const isAllStores = totalTenants > 0 && userTenants.length >= totalTenants;
      const primaryTenant = userTenants.length > 0 ? userTenants[0] : (u.tenant_id ? Number(u.tenant_id) : 1);

      let mecId: number;
      if (existingMec) {
        mecId = Number(existingMec.id);
        await pool.query(
          `UPDATE cad_mecanicos 
           SET user_id = ?, 
               tenant_id = COALESCE(?, tenant_id), 
               nome = ?, 
               ativo = 1, 
               todas_lojas = ?, 
               updated_at = NOW() 
           WHERE id = ?`,
          [u.id, primaryTenant, String(u.nome).trim(), isAllStores ? 1 : 0, mecId]
        );
      } else {
        const [ins] = await pool.query<any>(
          `INSERT INTO cad_mecanicos (tenant_id, user_id, nome, apelido, comissao_servico_pct, comissao_peca_pct, ativo, is_auxiliar, todas_lojas)
           VALUES (?, ?, ?, NULL, 0, 0, 1, 0, ?)`,
          [primaryTenant, u.id, String(u.nome).trim(), isAllStores ? 1 : 0]
        );
        mecId = Number(ins.insertId);
      }

      // Sincronizar mecanico_tenants
      if (userTenants.length > 0) {
        await pool.query('DELETE FROM mecanico_tenants WHERE mecanico_id = ?', [mecId]).catch(() => {});
        const rows = userTenants.map((tid) => [mecId, tid]);
        await pool.query('INSERT IGNORE INTO mecanico_tenants (mecanico_id, tenant_id) VALUES ?', [rows]).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[syncColaboradoresToMecanicos] Erro na sincronização:', err);
  }
}

/**
 * Verificação ultra-rápida para garantir sincronização sob demanda.
 * Executa a sincronização caso algum colaborador ativo com permissão de OS ou papel operacional
 * não esteja ativo em cad_mecanicos ou suas lojas em user_tenants não estejam em mecanico_tenants.
 */
export async function ensureOperationalMecanicosSync(pool: Pool): Promise<void> {
  try {
    const [[row]] = await pool.query<any>(`
      SELECT COUNT(*) as missingCount
      FROM users u
      WHERE u.ativo = 1 
        AND (
          u.role IN ('mecanico', 'manager', 'operator')
          OR (u.custom_permissions = 1 AND EXISTS (
            SELECT 1 FROM user_permissions up 
            WHERE up.user_id = u.id AND up.permission IN ('os_orders', 'oficina')
          ))
        )
        AND (
          NOT EXISTS (
            SELECT 1 FROM cad_mecanicos m 
            WHERE (m.user_id = u.id OR LOWER(TRIM(m.nome)) = LOWER(TRIM(u.nome))) 
              AND m.ativo = 1
          )
          OR EXISTS (
            SELECT 1 FROM user_tenants ut
            WHERE ut.user_id = u.id
              AND NOT EXISTS (
                SELECT 1 FROM mecanico_tenants mt
                JOIN cad_mecanicos m ON m.id = mt.mecanico_id
                WHERE (m.user_id = u.id OR LOWER(TRIM(m.nome)) = LOWER(TRIM(u.nome))) 
                  AND mt.tenant_id = ut.tenant_id
              )
          )
        )
    `);

    if (Number(row?.missingCount || 0) > 0) {
      await syncColaboradoresToMecanicos(pool);
    }
  } catch (err) {
    console.error('[ensureOperationalMecanicosSync] Erro na verificação:', err);
  }
}
