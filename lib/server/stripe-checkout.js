import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getSupabase } from "@/lib/supabase";

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

export const BASE_URL =
  process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function normalizePhone(phone = "") {
  return String(phone).replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function getCustomerName({ name, client }) {
  return (
    String(name || "").trim() ||
    client?.brand_name ||
    client?.name ||
    undefined
  );
}

async function persistStripeCustomerId(supabase, clientId, customerId) {
  if (!supabase || !clientId || !customerId) return;

  await supabase
    .from("clients")
    .update({ stripe_customer_id: customerId })
    .eq("id", clientId);
}

async function findStripeCustomerById(customerId) {
  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || customer.deleted) return null;
    return customer;
  } catch {
    return null;
  }
}

async function findStripeCustomerByEmail(email, clientId) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const result = await stripe.customers.list({
    email: normalizedEmail,
    limit: 10,
  });

  if (!result?.data?.length) return null;

  return (
    result.data.find(
      (customer) => String(customer.metadata?.client_id || "") === clientId
    ) || result.data[0]
  );
}

export async function resolveClientStripeCustomer({
  clientId,
  email = "",
  name = "",
  phone = "",
  createIfMissing = false,
}) {
  if (!clientId) {
    return {
      client: null,
      customer: null,
      customerId: "",
      created: false,
    };
  }

  const supabase = getSupabase();
  const { data: client } = await supabase
    .from("clients")
    .select("id,name,brand_name,owner_email,stripe_customer_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    return {
      client: null,
      customer: null,
      customerId: "",
      created: false,
    };
  }

  const storedCustomer = await findStripeCustomerById(client.stripe_customer_id);

  if (storedCustomer) {
    return {
      client,
      customer: storedCustomer,
      customerId: storedCustomer.id,
      created: false,
    };
  }

  const lookupEmail = normalizeEmail(email || client.owner_email);
  const matchedCustomer = await findStripeCustomerByEmail(lookupEmail, clientId);

  if (matchedCustomer) {
    await persistStripeCustomerId(supabase, clientId, matchedCustomer.id);

    if (!matchedCustomer.metadata?.client_id) {
      await stripe.customers.update(matchedCustomer.id, {
        metadata: {
          ...(matchedCustomer.metadata || {}),
          client_id: clientId,
        },
      });
    }

    return {
      client,
      customer: matchedCustomer,
      customerId: matchedCustomer.id,
      created: false,
    };
  }

  if (!createIfMissing) {
    return {
      client,
      customer: null,
      customerId: "",
      created: false,
    };
  }

  const createdCustomer = await stripe.customers.create({
    email: lookupEmail || undefined,
    name: getCustomerName({ name, client }),
    phone: normalizePhone(phone) || undefined,
    metadata: {
      client_id: clientId,
      client_name: client.brand_name || client.name || clientId,
    },
  });

  await persistStripeCustomerId(supabase, clientId, createdCustomer.id);

  return {
    client,
    customer: createdCustomer,
    customerId: createdCustomer.id,
    created: true,
  };
}

export async function getClientBillingState(clientId) {
  if (!clientId) {
    return {
      activeSubscription: null,
      hasManagedSubscription: false,
    };
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      client_id: clientId,
      status: {
        in: ["trialing", "active", "past_due", "unpaid", "incomplete"],
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return {
    activeSubscription,
    hasManagedSubscription: Boolean(activeSubscription),
  };
}

export async function resolveCheckoutProduct({ plan, productId }) {
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product?.stripe_price_id) return null;

    return {
      priceId: product.stripe_price_id,
      productTier: product.tier || "basic",
      productName: product.name || "",
    };
  }

  const value = String(plan || "").toLowerCase();

  if (value === "premium") {
    return {
      priceId: process.env.STRIPE_PRICE_PREMIUM || "",
      productTier: "premium",
      productName: "Premium",
    };
  }

  if (value === "pro") {
    return {
      priceId: process.env.STRIPE_PRICE_PRO || "",
      productTier: "pro",
      productName: "Pro",
    };
  }

  return {
    priceId: process.env.STRIPE_PRICE_BASIC || "",
    productTier: value === "starter" ? "starter" : "basic",
    productName: value === "starter" ? "Starter" : "Basic",
  };
}

export async function resolveCheckoutConfig({ plan, productId }) {
  const product = await resolveCheckoutProduct({ plan, productId });

  if (!product?.priceId) {
    return null;
  }

  const price = await stripe.prices.retrieve(product.priceId);
  const mode = price?.type === "recurring" ? "subscription" : "payment";

  return {
    ...product,
    mode,
    isRecurring: mode === "subscription",
    interval: price?.recurring?.interval || null,
  };
}
