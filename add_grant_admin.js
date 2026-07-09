const fs = require('fs');
let content = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const newGrantAdmin = `
async function grantAdmin(targetEmail) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { data, error } = await getSupabase().rpc('grant_admin', { target_email: targetEmail });
  if (error) throw error;
  return data;
}
`;

if(!content.includes('async function grantAdmin')) {
    content += newGrantAdmin;
    fs.writeFileSync('c:/classificado/js/supabase.js', content);
}
