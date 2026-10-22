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
 * 2. Usuários vinculados a mecânicos existentes em cad_mecanicos.
 * 3. Preserva ESTRITAMENTE o status ativo configurado na Gestão de Mecânicos pelo administrador.
 *    Se um mecânico foi inativado (ativo = 0), esta sincronização NÃO o reativa automaticamente.
 */
export async function syncColaboradoresToMecanicos(pool: Pool, targetUserId?: number): Promise<void> {
  try {
    const userFilter = targetUserId
      ? `AND u.id = ${Number(targetUserId)}`
      : `AND (
           u.role = 'mecanico'
           OR EXISTS (SELECT 1 FROM cad_mecanicos cm WHERE cm.user_id = u.id)
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

      // Se o usuário do sistema está inativo (u.ativo = 0), inativa também o registro do mecânico
      if (!u.ativo) {
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
        // REGRA CRÍTICA: Se o administrador desativou este mecânico na Gestão de Mecânicos (existingMec.ativo = 0),
        // PRESERVA o status inativo (ativo = 0)! NUNCA força ativo = 1 contra a vontade do administrador.
        const finalAtivo = Number(existingMec.ativo) === 0 ? 0 : 1;

        await pool.query(
          `UPDATE cad_mecanicos 
           SET user_id = ?, 
               tenant_id = COALESCE(?, tenant_id), 
               nome = ?, 
               ativo = ?, 
               todas_lojas = ?, 
               updated_at = NOW() 
           WHERE id = ?`,
          [u.id, primaryTenant, String(u.nome).trim(), finalAtivo, isAllStores ? 1 : 0, mecId]
        );
      } else {
        // Novo registro em cad_mecanicos só deve ser criado automaticamente se o usuário tiver perfil 'mecanico'
        if (u.role === 'mecanico') {
          const [ins] = await pool.query<any>(
            `INSERT INTO cad_mecanicos (tenant_id, user_id, nome, apelido, comissao_servico_pct, comissao_peca_pct, ativo, is_auxiliar, todas_lojas)
             VALUES (?, ?, ?, NULL, 0, 0, 1, 0, ?)`,
            [primaryTenant, u.id, String(u.nome).trim(), isAllStores ? 1 : 0]
          );
          mecId = Number(ins.insertId);
        } else {
          continue;
        }
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
 * Verificação rápida para garantir sincronização sob demanda de mecânicos essenciais.
 * Executa a sincronização APENAS se algum usuário com perfil 'mecanico' ativo não possuir
 * registro criado em cad_mecanicos.
 * NOTA: NÃO verifica 'm.ativo = 1', pois mecânicos inativados pelo administrador não devem disparar sincronização.
 */
export async function ensureOperationalMecanicosSync(pool: Pool): Promise<void> {
  try {
    const [[row]] = await pool.query<any>(`
      SELECT COUNT(*) as missingCount
      FROM users u
      WHERE u.ativo = 1 
        AND u.role = 'mecanico'
        AND NOT EXISTS (
          SELECT 1 FROM cad_mecanicos m 
          WHERE (m.user_id = u.id OR LOWER(TRIM(m.nome)) = LOWER(TRIM(u.nome)))
        )
    `);

    if (Number(row?.missingCount || 0) > 0) {
      await syncColaboradoresToMecanicos(pool);
    }
  } catch (err) {
    console.error('[ensureOperationalMecanicosSync] Erro na verificação:', err);
  }
}
