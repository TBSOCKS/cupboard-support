import { createServerClient } from '@/lib/supabase';
import type Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// TOOL SCHEMAS — what we tell Claude these tools do
// ============================================================================

export const ORDER_STATUS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lookup_order',
    description:
      'Look up an order by order number. Returns the order status, items, total, shipping address, and timestamps. Use this when the customer mentions an order number (format: CB-NNNNNN). If they have not provided one, ask for it before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number, e.g. "CB-187234"',
        },
      },
      required: ['order_number'],
    },
  },
  {
    name: 'get_tracking',
    description:
      'Get carrier tracking details for an order, including carrier name, tracking number, and current estimated delivery date. Only call this AFTER you have confirmed the order exists via lookup_order.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number, e.g. "CB-187234"',
        },
      },
      required: ['order_number'],
    },
  },
];

// ============================================================================
// TOOL EXECUTORS — what actually runs when Claude calls each tool
// ============================================================================

interface LookupOrderResult {
  found: boolean;
  order_number?: string;
  status?: string;
  ordered_at?: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  estimated_delivery_at?: string | null;
  total_dollars?: string;
  shipping_address?: string;
  items?: Array<{ name: string; quantity: number }>;
  notes?: string | null;
  error?: string;
}

export async function lookup_order(
  order_number: string
): Promise<LookupOrderResult> {
  const supabase = createServerClient();

  // Normalize: user might type "187234" or "cb-187234" or "CB187234"
  const normalized = order_number.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatted = normalized.startsWith('CB')
    ? `CB-${normalized.slice(2)}`
    : `CB-${normalized}`;

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_number, status, ordered_at, shipped_at, delivered_at, estimated_delivery_at, total_cents, shipping_address, notes'
    )
    .eq('order_number', formatted)
    .maybeSingle();

  if (error) {
    return { found: false, error: 'Database error during lookup' };
  }

  if (!order) {
    return { found: false, error: `No order found with number ${formatted}` };
  }

  // Get the items
  const { data: items } = await supabase
    .from('order_items')
    .select('quantity, products(name)')
    .eq(
      'order_id',
      (
        await supabase
          .from('orders')
          .select('id')
          .eq('order_number', formatted)
          .single()
      ).data?.id
    );

  return {
    found: true,
    order_number: order.order_number,
    status: order.status,
    ordered_at: order.ordered_at,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    estimated_delivery_at: order.estimated_delivery_at,
    total_dollars: `$${(order.total_cents / 100).toFixed(2)}`,
    shipping_address: order.shipping_address,
    items:
      items?.map((it: any) => ({
        name: it.products?.name ?? 'Unknown product',
        quantity: it.quantity,
      })) ?? [],
    notes: order.notes,
  };
}

interface GetTrackingResult {
  found: boolean;
  carrier?: string | null;
  tracking_number?: string | null;
  status?: string;
  estimated_delivery_at?: string | null;
  shipped_at?: string | null;
  notes?: string | null;
  error?: string;
}

export async function get_tracking(
  order_number: string
): Promise<GetTrackingResult> {
  const supabase = createServerClient();
  const normalized = order_number.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatted = normalized.startsWith('CB')
    ? `CB-${normalized.slice(2)}`
    : `CB-${normalized}`;

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'carrier, tracking_number, status, estimated_delivery_at, shipped_at, notes'
    )
    .eq('order_number', formatted)
    .maybeSingle();

  if (error || !order) {
    return { found: false, error: 'Order not found' };
  }

  if (!order.tracking_number) {
    return {
      found: true,
      status: order.status,
      carrier: null,
      tracking_number: null,
      shipped_at: null,
      estimated_delivery_at: null,
      notes:
        'No tracking available yet — order has not shipped. Current status: ' +
        order.status,
    };
  }

  return {
    found: true,
    carrier: order.carrier,
    tracking_number: order.tracking_number,
    status: order.status,
    estimated_delivery_at: order.estimated_delivery_at,
    shipped_at: order.shipped_at,
    notes: order.notes,
  };
}

// ============================================================================
// DISPATCHER — runs the right tool by name
// ============================================================================

export async function executeOrderStatusTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (name === 'lookup_order') {
    return await lookup_order(input.order_number as string);
  }
  if (name === 'get_tracking') {
    return await get_tracking(input.order_number as string);
  }
  throw new Error(`Unknown tool: ${name}`);
}
