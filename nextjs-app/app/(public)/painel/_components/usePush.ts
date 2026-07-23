import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export function usePushNotifications() {
  const [loading, setLoading] = useState(false);

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push Notifications não são suportadas neste navegador.');
      return;
    }
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        alert('Você bloqueou as notificações.');
        setLoading(false);
        return;
      }
      
      const PUBLIC_VAPID_KEY = 'BFFlZaR5-TNTgn7UUkoMJivPREKDG5dY-Dg2I7eJopJSgNAZGzP4ZA01vQysGhp9zeR8qD3Yiyz_OBtq17Ux49g';
      const padding = '='.repeat((4 - PUBLIC_VAPID_KEY.length % 4) % 4);
      const base64 = (PUBLIC_VAPID_KEY + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray
      });
      
      const { data: { user } } = await getSupabase().auth.getUser();
      if (user) {
        const { error } = await getSupabase().from('push_subscriptions').insert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh') || new ArrayBuffer(0))))),
          auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth') || new ArrayBuffer(0)))))
        });
        
        if (error) alert('Erro ao salvar inscrição no banco.');
        else alert('Notificações ativadas com sucesso!');
      }
    } catch (err) {
      alert('Falha ao registrar Push.');
    } finally {
      setLoading(false);
    }
  };

  return { subscribe, loading };
}
