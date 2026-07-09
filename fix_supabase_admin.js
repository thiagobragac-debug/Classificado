const fs = require('fs');
let content = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const newFunctions = `
// ─── ADMIN KYC ────────────────────────────────────────────────────────
async function checkIsAdmin() {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await getSupabase().from('profiles').select('is_admin').eq('id', session.user.id).single();
  if (error || !data) return false;
  return data.is_admin === true;
}

async function getPendingVerifications() {
  const { data, error } = await getSupabase()
    .from('user_verifications')
    .select('*, profiles(full_name, email)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function updateVerificationStatus(id, newStatus, notes = '') {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  // Optional: You can re-check admin here in backend policy or frontend
  const { error } = await getSupabase()
    .from('user_verifications')
    .update({ status: newStatus, admin_notes: notes, reviewed_at: new Date().toISOString(), reviewed_by: session.user.id })
    .eq('id', id);
  if (error) throw error;
  
  // If approved, update profile verif_status
  if (newStatus === 'approved') {
    const { data: verif } = await getSupabase().from('user_verifications').select('user_id').eq('id', id).single();
    if (verif) {
      await getSupabase().from('profiles').update({ verif_status: 'approved' }).eq('id', verif.user_id);
    }
  }
}
`;

if (!content.includes('checkIsAdmin')) {
    content += '\n' + newFunctions;
    // Export them if there's an export block at the end
    // Actually, in supabase.js, functions are usually exposed globally since it's a regular JS file included in <script>
    fs.writeFileSync('c:/classificado/js/supabase.js', content);
}
