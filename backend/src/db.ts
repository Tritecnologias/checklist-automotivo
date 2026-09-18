import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? 'api_user',
  password: process.env.DB_PASSWORD ?? 'api_pass_2024',
  database: process.env.DB_NAME     ?? '4rodas',
  // cad_produtos/cad_clientes são latin1; charset utf8mb4 faz MySQL converter
  // corretamente em ambas as direções (SELECT e UPDATE/INSERT)
  charset: 'UTF8MB4',
  waitForConnections: true,
  connectionLimit: 10,
});
