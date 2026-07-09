const { MercadoPagoConfig, Preference, PreApprovalPlan, PreApproval } = require('mercadopago');

// Factory or Strategy pattern for payment gateways
class PaymentService {
  constructor(gateway = 'mercadopago') {
    this.gateway = gateway;
    
    if (this.gateway === 'mercadopago') {
      this.client = new MercadoPagoConfig({ 
        accessToken: process.env.MP_ACCESS_TOKEN || 'APP_USR-TEST-MOCK-TOKEN',
        options: { timeout: 5000 } 
      });
    }
  }

  /**
   * Create a checkout session for a one-time payment (e.g. ad highlights)
   */
  async createOneTimePayment({ title, amount, externalReference, successUrl, failureUrl, pendingUrl }) {
    if (this.gateway === 'mercadopago') {
      const preference = new Preference(this.client);
      const result = await preference.create({
        body: {
          items: [{
            id: externalReference,
            title: title,
            quantity: 1,
            unit_price: amount
          }],
          external_reference: externalReference,
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl
          },
          auto_return: 'approved',
        }
      });
      return { init_point: result.init_point, id: result.id };
    }
    throw new Error('Gateway not supported');
  }

  /**
   * Create a subscription for a user based on a plan
   */
  async createSubscription({ planName, amount, userEmail, externalReference, successUrl, failureUrl }) {
    if (this.gateway === 'mercadopago') {
      // For subscriptions in MP, we ideally create a PreApprovalPlan and then a PreApproval.
      // For simplicity in this demo/abstraction, we use Preference with purpose 'wallet_purchase' or just standard checkout
      // In a real scenario, you'd use the PreApproval SDK API here.
      
      const preference = new Preference(this.client);
      const result = await preference.create({
        body: {
          items: [{
            id: externalReference,
            title: `Assinatura: ${planName}`,
            quantity: 1,
            unit_price: amount
          }],
          payer: { email: userEmail || 'test@user.com' },
          external_reference: externalReference,
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: successUrl
          },
          auto_return: 'approved',
        }
      });
      return { init_point: result.init_point, id: result.id };
    }
    // E.g. if (this.gateway === 'stripe') { return stripe.checkout.sessions.create(...) }
    throw new Error('Gateway not supported');
  }
}

module.exports = new PaymentService(process.env.PAYMENT_GATEWAY || 'mercadopago');
