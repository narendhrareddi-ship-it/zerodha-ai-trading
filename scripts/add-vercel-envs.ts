import { execSync } from 'child_process';

const envs = {
  DATABASE_URL: 'postgresql://postgres.umfliadsmbrxxkkfbbsn:NarendhraReddi1431@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
  DIRECT_URL: 'postgresql://postgres.umfliadsmbrxxkkfbbsn:NarendhraReddi1431@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
  NEXTAUTH_SECRET: '3hrbu60v593ioP0Qed63pES7Jj9JBvEa',
  CRON_SECRET: 'cronsecret12345!',
  ABACUSAI_API_KEY: 's2_2ee0cdd8c3a2481988f8868d2ab109ad',
  KITE_API_KEY: '8pu6ys3tdgxb99so',
  KITE_API_SECRET: '7rmia27pmuar22fewy94z86xgggjstj3',
  TELEGRAM_BOT_TOKEN: '8887843181:AAHfOve5si9mlO4w-nJefqUI8kz5XpbZoi4'
};

async function main() {
  console.log('--- Setting Vercel Environment Variables ---');

  for (const [key, val] of Object.entries(envs)) {
    console.log(`Adding ${key}...`);
    try {
      // Add to production environment only to avoid conflicts or prompting
      execSync(`npx vercel env add ${key} production --value "${val}" --yes`, { stdio: 'inherit' });
    } catch (err: any) {
      console.warn(`Failed to add ${key}: ${err?.message}`);
    }
  }

  console.log('--- Environment Variables Configuration Completed ---');
}

main().catch(console.error);
