import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { useLang } from '@/lib/lang-context';

const TRANSLATIONS = {
  pt: {
    unsupported: 'Push Notifications não são suportadas neste navegador.',
    blocked: 'Você bloqueou as notificações.',
    saveError: 'Erro ao salvar inscrição no banco.',
    success: 'Notificações ativadas com sucesso!',
    fail: 'Falha ao registrar Push.',
  },
  es: {
    unsupported: 'Las Notificaciones Push no son compatibles con este navegador.',
    blocked: 'Bloqueaste las notificaciones.',
    saveError: 'Error al guardar la inscripción en la base de datos.',
    success: '¡Notificaciones activadas con éxito!',
    fail: 'Error al registrar el Push.',
  },
};

export function usePushNotifications() {
  const [loading, setLoading] = useState(false);
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast(t.unsupported, 'warning');
      return;
    }
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        showToast(t.blocked, 'warning');
        setLoading(false);
        return;
      }

      const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY!;
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

        if (error) showToast(t.saveError, 'error');
        else showToast(t.success, 'success');
      }
    } catch (err) {
      showToast(t.fail, 'error');
    } finally {
      setLoading(false);
    }
  };

  return { subscribe, loading };
}
