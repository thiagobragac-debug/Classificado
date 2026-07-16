
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Stripe = require('stripe');
const axios = require('axios');

class PaymentService {
  async createTransparentIntent({ gateway, settings, planName, amount, userEmail, externalReference }) {
    if (gateway === 'stripe') {
      const stripe = Stripe(settings.stripe_secret_key || process.env.STRIPE_SECRET_KEY);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'brl',
        metadata: { external_reference: externalReference },
        receipt_email: userEmail
      });
      return { 
        clientSecret: paymentIntent.client_secret, 
        publicKey: settings.stripe_pub_key || process.env.STRIPE_PUB_KEY 
      };
    } 
    
    if (gateway === 'mercadopago') {
      const client = new MercadoPagoConfig({ accessToken: settings.mp_access_token || process.env.MP_ACCESS_TOKEN });
      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{ id: externalReference, title: planName, quantity: 1, unit_price: amount }],
          payer: { email: userEmail },
          external_reference: externalReference,
          purpose: 'wallet_purchase'
        }
      });
      return { 
        preferenceId: result.id, 
        publicKey: settings.mp_public_key || process.env.MP_PUBLIC_KEY 
      };
    }

    if (gateway === 'pagarme') {
      // Create a basic intent or order placeholder for Pagar.me
      return { 
        publicKey: settings.pagarme_pub_key || process.env.PAGARME_PUB_KEY 
      };
    }

    throw new Error('Gateway not supported');
  }

  async processTransparentPayment({ gateway, settings, tx, token, paymentMethodId, issuerId, installments, payer }) {
    if (gateway === 'mercadopago') {
      const client = new MercadoPagoConfig({ accessToken: settings.mp_access_token || process.env.MP_ACCESS_TOKEN });
      const payment = new Payment(client);
      const result = await payment.create({
        body: {
          transaction_amount: tx.amount,
          token: token,
          description: 'Assinatura Tauze Class',
          installments: Number(installments) || 1,
          payment_method_id: paymentMethodId,
          issuer_id: issuerId,
          payer: {
            email: payer.email,
            identification: payer.identification
          },
          external_reference: tx.id
        }
      });
      return { id: result.id, status: result.status };
    }
    
    if (gateway === 'pagarme') {
      // Pagar.me V5 Orders API (pagamento avulso — destaques)
      const auth = Buffer.from((settings.pagarme_secret_key || process.env.PAGARME_SECRET_KEY) + ':').toString('base64');
      const response = await axios.post('https://api.pagar.me/core/v5/orders', {
        items: [{ amount: Math.round(tx.amount * 100), description: 'Destaque', quantity: 1, code: tx.id }],
        customer: {
          name: payer.name || payer.email,
          email: payer.email,
          type: 'individual',
          document: payer.document || (payer.identification && payer.identification.number)
        },
        payments: [{
          payment_method: 'credit_card',
          credit_card: {
            // V5: card_token dentro do objeto card
            card: { card_token: token },
            installments: Number(installments) || 1,
            statement_descriptor: 'CLASSIFICADO'
          }
        }],
        metadata: { external_reference: tx.id }
      }, {
        headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' }
      });
      return { id: response.data.id, status: response.data.status };
    }

    throw new Error('Processamento direto não suportado para este gateway');
  }

  // --- MÉTODOS DE ASSINATURA (SUBSCRIPTION) ---

  async createSubscriptionIntent({ gateway, settings, externalReference, planName, amount, payerEmail }) {

    if (gateway === 'stripe') {
      const stripe = Stripe(settings.stripe_secret_key || process.env.STRIPE_SECRET_KEY);
      const setupIntent = await stripe.setupIntents.create({
        usage: 'off_session',                // Otimizado para cobrança sem presença do cliente (assinaturas)
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never'           // Card-only, sem redirecionamentos
        },
        metadata: { external_reference: externalReference }
      });
      return { clientSecret: setupIntent.client_secret, publicKey: settings.stripe_pub_key || process.env.STRIPE_PUB_KEY };
    }
    if (gateway === 'mercadopago') {
      return { publicKey: settings.mp_public_key || process.env.MP_PUBLIC_KEY };
    }
    if (gateway === 'pagarme') {
      return { publicKey: settings.pagarme_pub_key || process.env.PAGARME_PUB_KEY };
    }
    if (gateway === 'asaas') {
      // ASAAS não tem intent server-side nem tokenização no frontend.
      // O frontend exibe formulário nativo (2 passos) e envia os dados direto ao backend.
      return { useNativeForm: true };
    }
    throw new Error('Gateway not supported for subscriptions');
  }

  async processSubscription({ gateway, settings, planName, amount, tx, token, paymentMethodId, issuerId, installments, payer }) {
    if (gateway === 'mercadopago') {
      // Mercado Pago PreApproval (Assinaturas)
      const { PreApproval } = require('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: settings.mp_access_token || process.env.MP_ACCESS_TOKEN });
      const preApproval = new PreApproval(client);
      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:8080';
      try {
        const result = await preApproval.create({
          body: {
            back_url: `${frontendUrl}/painel.html?status=success`,
            reason: planName,
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: amount,
              currency_id: "BRL"
            },
            payer_email: payer.email,
            card_token_id: token,
            external_reference: tx.id,
            status: "authorized"
          }
        });
        return { id: result.id, status: result.status };
      } catch (err) {
        console.error('Mercado Pago PreApproval Error:', err);
        throw new Error('Falha ao processar assinatura no Mercado Pago: ' + (err.message || 'Erro desconhecido'));
      }
    }

    if (gateway === 'pagarme') {
      // Pagar.me V5 Subscriptions API — payload correto conforme documentação oficial
      const secretKey = settings.pagarme_secret_key || process.env.PAGARME_SECRET_KEY;
      const authHeader = Buffer.from(secretKey + ':').toString('base64');
      
      // V5: endereço usa line_1 = "Número, Rua, Bairro" (não campos separados)
      const addressLine1 = [payer.number, payer.street, payer.neighborhood || 'Centro']
        .filter(Boolean).join(', ') || 'Não informado';

      const payload = {
        payment_method: 'credit_card',
        interval: 'month',
        interval_count: 1,
        billing_type: 'prepaid',
        // V5: card_token DEVE estar dentro do objeto card
        card: { card_token: token },
        installments: 1,
        customer: {
          name: payer.name || payer.email,
          email: payer.email,
          document: payer.document,
          type: 'individual',
          phones: {
            mobile_phone: {
              country_code: '55',
              area_code: payer.phone ? payer.phone.substring(0, 2) : '11',
              number: payer.phone ? payer.phone.substring(2) : '900000000'
            }
          },
          address: {
            line_1: addressLine1,
            zip_code: (payer.zip || '').replace(/\D/g, ''),
            city: payer.city || 'São Paulo',
            state: payer.state || 'SP',
            country: 'BR'
          }
        },
        items: [{
          name: planName,
          quantity: 1,
          pricing_scheme: { price: Math.round(amount * 100) }
        }],
        metadata: { external_reference: tx.id }
      };

      try {
        const response = await axios.post('https://api.pagar.me/core/v5/subscriptions', payload, {
          headers: {
            'Authorization': 'Basic ' + authHeader,
            'Content-Type': 'application/json'
          }
        });
        return { id: response.data.id, status: response.data.status };
      } catch (err) {
        console.error('Pagar.me Subscription Error:', err.response?.data || err.message);
        throw new Error('Falha ao processar assinatura no Pagar.me: ' + (err.response?.data?.message || err.message));
      }
    }
    
    if (gateway === 'stripe') {
      const stripe = Stripe(settings.stripe_secret_key || process.env.STRIPE_SECRET_KEY);

      // Passo 1: Buscar Customer existente ou Criar
      let customer;
      const existingCustomers = await stripe.customers.list({ email: payer.email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: payer.email,
          name: payer.name || payer.email
        });
      }

      // Passo 2: Vincular o PaymentMethod explicitamente ao Customer
      // (Necessário: o PM deve pertencer ao customer antes de criar a subscription)
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      // Passo 3: Definir como método padrão do Customer
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId }
      });
      
      // Passo 4: Criar a Subscription com price_data inline (evita criar Product/Price duplicados no dashboard)
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(amount * 100),
            recurring: { interval: 'month' },
            product_data: { name: planName }
          }
        }],
        default_payment_method: paymentMethodId,   // Explícito para garantir o método correto
        payment_behavior: 'default_incomplete',     // SCA/3DS compliance
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: { external_reference: tx.id }
      });
      return { id: subscription.id, status: subscription.status };
    }

    if (gateway === 'asaas') {
      // ASAAS Core API
      // Ref: https://docs.asaas.com/reference/criar-nova-assinatura
      const apiKey  = settings.asaas_api_key  || process.env.ASAAS_API_KEY;
      const sandbox = (settings.asaas_sandbox || process.env.ASAAS_SANDBOX || 'false') === 'true';
      const baseUrl = sandbox
        ? 'https://api-sandbox.asaas.com/v3'
        : 'https://api.asaas.com/v3';

      const headers = {
        'access_token': apiKey,          // Header específico do ASAAS (não usa Bearer)
        'Content-Type': 'application/json'
      };

      // Passo 1: Deduplicar Customer por CPF/CNPJ (ASAAS não impede duplicatas)
      let customerId;
      try {
        const searchRes = await axios.get(
          `${baseUrl}/customers?cpfCnpj=${encodeURIComponent((payer.document || '').replace(/\D/g, ''))}`,
          { headers }
        );
        if (searchRes.data.totalCount > 0) {
          customerId = searchRes.data.data[0].id; // Reutiliza customer existente
          console.log('[asaas] Reutilizando customer existente:', customerId);
        }
      } catch (_) { /* Se busca falhar, cria novo */ }

      // Passo 2: Criar Customer se não encontrado
      if (!customerId) {
        const customerRes = await axios.post(`${baseUrl}/customers`, {
          name:           payer.name || payer.email,
          cpfCnpj:       (payer.document || '').replace(/\D/g, ''),
          email:          payer.email,
          mobilePhone:   (payer.phone || '').replace(/\D/g, ''),
          postalCode:    (payer.zip   || '').replace(/\D/g, ''),
          address:        payer.street,
          addressNumber:  payer.number,
          externalReference: String(tx.user_id || '')
        }, { headers });
        customerId = customerRes.data.id;
        console.log('[asaas] Customer criado:', customerId);
      }

      // Passo 3: Criar Subscription com cartão inline
      // nextDueDate = hoje (no fuso de Brasília) → cobrança imediata no sandbox/produção
      const nextDueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      const subPayload = {
        customer:      customerId,
        billingType:  'CREDIT_CARD',
        value:         amount,
        nextDueDate,
        cycle:        'MONTHLY',
        description:   planName,
        externalReference: String(tx.id),    // Nosso tx.id → webhook usa para identificar
        remoteIp:      payer.remoteIp,        // OBRIGATÓRIO para cartão de crédito
        creditCard: {
          holderName:   payer.cardHolderName,
          number:      (payer.cardNumber || '').replace(/\s/g, ''),
          expiryMonth:  payer.cardExpMonth,
          expiryYear:   payer.cardExpYear,
          ccv:          payer.cardCvv
        },
        creditCardHolderInfo: {
          name:          payer.name || payer.email,
          email:         payer.email,
          cpfCnpj:      (payer.document || '').replace(/\D/g, ''),
          postalCode:   (payer.zip     || '').replace(/\D/g, ''),
          addressNumber: payer.number,
          phone:        (payer.phone   || '').replace(/\D/g, '')
        }
      };

      try {
        // Timeout mínimo de 60s (doc ASAAS): evita cobranças duplas por retry precoce
        const subRes = await axios.post(`${baseUrl}/subscriptions`, subPayload, {
          headers,
          timeout: 60000
        });
        const sub = subRes.data;
        // Normaliza status para o padrão interno do sistema
        const normalizedStatus = sub.status === 'ACTIVE' ? 'active' : 'pending';
        return { id: sub.id, status: normalizedStatus };
      } catch (err) {
        const msg = err.response?.data?.errors?.[0]?.description
          || err.response?.data?.error
          || err.message;
        console.error('[asaas] Subscription error:', err.response?.data || err.message);
        throw new Error('Falha ao processar assinatura no ASAAS: ' + msg);
      }
    }

    throw new Error('Processamento de assinatura não suportado para este gateway');
  }
}

module.exports = new PaymentService();
