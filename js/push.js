/**
 * Sistema de Notificações Push - Tauze Class
 * Este arquivo lidará com a inscrição do usuário para receber notificações no celular.
 */

// NOTA PARA O ADMINISTRADOR:
// Substitua a string abaixo pela sua VAPID Public Key que será gerada no backend.
const PUBLIC_VAPID_KEY = 'BFFlZaR5-TNTgn7UUkoMJivPREKDG5dY-Dg2I7eJopJSgNAZGzP4ZA01vQysGhp9zeR8qD3Yiyz_OBtq17Ux49g';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push Notifications não são suportadas neste navegador.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Pede permissão para o usuário (aparece o alerta do Chrome)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Você bloqueou as notificações. Não poderemos te avisar sobre vendas!');
      return;
    }

    // Cria a inscrição conectada ao servidor do Google/Apple
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
    });

    console.log('Inscrito com sucesso no Push:', subscription);

    // Envia a inscrição para o banco de dados (Supabase)
    const { data: { user } } = await getSupabase().auth.getUser();
    if (user) {
      const { error } = await getSupabase()
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
        });
      
      if (error) {
        console.error('Erro ao salvar inscrição no Supabase:', error);
      } else {
        alert('Tudo certo! Você será notificado quando receber mensagens.');
      }
    } else {
      console.warn('Usuário não está logado para salvar a notificação.');
    }

  } catch (err) {
    console.error('Falha ao registrar Push:', err);
  }
}

// Essa função poderá ser chamada no clique de um botão no painel de configurações do usuário.
window.subscribeToPushNotifications = subscribeToPushNotifications;
