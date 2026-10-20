import type { Pool } from 'mysql2/promise';

/**
 * Perfis de usuários do sistema que atuam operacionalmente na oficina / checklist
 * e que devem ser sincronizados com cad_mecanicos para seleção no tablet e na web.
 */
export const ROLES_COLABORADORES_OFICINA = ['mecanico', 'manager', 'operator'];

/**
 * Sincroniza colaboradores do sistema (users) com a tabela cad_mecanicos e mecanico_tenants.
 * Garante que gerentes, operadores e mecânicos marcados em lojas apareçam no tablet e na web.
 */
export async function syncColaboradoresToMecanicos(pool: Pool, targetUserId?: number): Promise<void> {
  try {
    const userFilter = targetUserId
      ? `AND u.id = ${Number(targetUserId)}`
      : `AND (u.role IN ('mecanico', 'manager', 'operator') OR EXISTS (SELECT 1 FROM cad_mecanicos cm WHERE cm.user_id = u.id))`;

    const [users] = await pool.query<any>(`
      SELECT u.id, u.nome, u.tenant_id, u.ativo, u.role,
             (SELECT GROUP_CONCAT(ut.tenant_id) FROM user_tenants ut WHERE ut.user_id = u.id) as tenant_ids_str
      FROM users u
      WHERE 1=1 ${userFilter}
    `);

    const [[tenantCountRow]] = await pool.query<any>(
      'SELECT COUNT(*) as totalTenants FROM tenants WHERE ativo = 1'
    );
    const totalTenants = Number(tenantCountRow?.totalTenants || 0);

    for (const u of users) {
      // Procura mecânico existente vinculado por user_id ou por nome exato (caso ainda não vinculado)
      const [[existingMec]] = await pool.query<any>(
        'SELECT id, tenant_id, ativo, todas_lojas FROM cad_mecanicos WHERE user_id = ? OR (user_id IS NULL AND LOWER(TRIM(nome)) = LOWER(TRIM(?))) LIMIT 1',
        [u.id, u.nome]
      );

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
      const isAtivo = u.ativo ? 1 : 0;

      let mecId: number;
      if (existingMec) {
        mecId = Number(existingMec.id);
        await pool.query(
          `UPDATE cad_mecanicos 
           SET user_id = ?, 
               tenant_id = COALESCE(?, tenant_id), 
               nome = ?, 
               ativo = ?, 
               todas_lojas = ?, 
               updated_at = NOW() 
           WHERE id = ?`,
          [u.id, primaryTenant, String(u.nome).trim(), isAtivo, isAllStores ? 1 : 0, mecId]
        );
      } else {
        const [ins] = await pool.query<any>(
          `INSERT INTO cad_mecanicos (tenant_id, user_id, nome, apelido, comissao_servico_pct, comissao_peca_pct, ativo, is_auxiliar, todas_lojas)
           VALUES (?, ?, ?, NULL, 0, 0, ?, 0, ?)`,
          [primaryTenant, u.id, String(u.nome).trim(), isAtivo, isAllStores ? 1 : 0]
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
 * Verificação ultra-rápida (menos de 1ms) para garantir sincronização sob demanda.
 * Executa a sincronização caso algum colaborador ativo não esteja ativo em cad_mecanicos
 * ou suas lojas em user_tenants não estejam em mecanico_tenants.
 */
export async function ensureOperationalMecanicosSync(pool: Pool): Promise<void> {
  try {
    const [[row]] = await pool.query<any>(`
      SELECT COUNT(*) as missingCount
      FROM users u
      WHERE u.ativo = 1 AND u.role IN ('mecanico', 'manager', 'operator')
        AND (
          NOT EXISTS (SELECT 1 FROM cad_mecanicos m WHERE m.user_id = u.id AND m.ativo = 1)
          OR EXISTS (
            SELECT 1 FROM user_tenants ut
            WHERE ut.user_id = u.id
              AND NOT EXISTS (
                SELECT 1 FROM mecanico_tenants mt
                JOIN cad_mecanicos m ON m.id = mt.mecanico_id
                WHERE m.user_id = u.id AND mt.tenant_id = ut.tenant_id
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
