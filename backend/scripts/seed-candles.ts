import { PrismaClient, OrderSide, OrderType, OrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: Cannot run staging/demo candle seed script in production!');
    process.exit(1);
  }

  console.log('Seeding staging/demo candles data...');

  // 1. Resolve active market (USDT-INR)
  const market = await prisma.market.findUnique({
    where: { symbol: 'USDT-INR' },
  });

  if (!market) {
    console.error('Market USDT-INR not found. Run db:seed or check setup first.');
    process.exit(1);
  }

  // 2. Create or find mock buyer and seller
  const buyerEmail = 'candle-buyer@exchange.local';
  const sellerEmail = 'candle-seller@exchange.local';

  // standard mock password hash
  const passwordHash = '$argon2id$v=19$m=65536,t=3,p=4$mockmockmockmock$mockmockmockmockmockmockmockmock';

  const buyer = await prisma.user.upsert({
    where: { email: buyerEmail },
    update: {},
    create: {
      email: buyerEmail,
      passwordHash,
      kycStatus: 'APPROVED',
      kycTier: 1,
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: sellerEmail },
    update: {},
    create: {
      email: sellerEmail,
      passwordHash,
      kycStatus: 'APPROVED',
      kycTier: 1,
    },
  });

  console.log(`Resolved mock users. Buyer ID: ${buyer.id}, Seller ID: ${seller.id}`);

  // 3. Generate ~300 mock trades spanning the last 2 days
  const nowMs = Date.now();
  const twoDaysAgoMs = nowMs - 2 * 24 * 60 * 60 * 1000;
  
  // Create trades incrementally
  const tradeCount = 300;
  const timeStep = (nowMs - twoDaysAgoMs) / tradeCount;

  let lastPrice = 83.50; // Starting price for USDT-INR

  console.log(`Generating ${tradeCount} trades...`);
  
  const tradesData = [];
  const ordersData = [];

  for (let i = 0; i < tradeCount; i++) {
    // Random walk price
    const change = (Math.random() - 0.5) * 0.4; // max 20 paise change
    let price = lastPrice + change;
    if (price < 70) price = 70; // lower bound
    if (price > 100) price = 100; // upper bound
    price = Math.round(price * 100) / 100; // round to 2 decimals
    lastPrice = price;

    const quantity = Math.round((0.5 + Math.random() * 50) * 1000000) / 1000000; // random quantity
    const quoteAmount = Math.round((price * quantity) * 100) / 100;

    const executedAt = new Date(twoDaysAgoMs + i * timeStep);

    // Create unique IDs
    const buyOrderId = randomUUID();
    const sellOrderId = randomUUID();
    const tradeId = randomUUID();
    const fillId = `fill-${tradeId.slice(0, 18)}`;

    // Push BUY order
    ordersData.push({
      id: buyOrderId,
      userId: buyer.id,
      marketId: market.id,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: price.toString(),
      quantity: quantity.toString(),
      filledQuantity: quantity.toString(),
      quoteSpent: quoteAmount.toString(),
      status: OrderStatus.FILLED,
      createdAt: executedAt,
      updatedAt: executedAt,
      closedAt: executedAt,
    });

    // Push SELL order
    ordersData.push({
      id: sellOrderId,
      userId: seller.id,
      marketId: market.id,
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: price.toString(),
      quantity: quantity.toString(),
      filledQuantity: quantity.toString(),
      quoteSpent: quoteAmount.toString(),
      status: OrderStatus.FILLED,
      createdAt: executedAt,
      updatedAt: executedAt,
      closedAt: executedAt,
    });

    // Push Trade record
    tradesData.push({
      id: tradeId,
      fillId,
      marketId: market.id,
      makerOrderId: buyOrderId,
      takerOrderId: sellOrderId,
      makerUserId: buyer.id,
      takerUserId: seller.id,
      price: price.toString(),
      quantity: quantity.toString(),
      quoteAmount: quoteAmount.toString(),
      makerSide: OrderSide.BUY,
      executedAt,
    });
  }

  // Insert in chunks/batches
  console.log('Inserting orders...');
  await prisma.order.createMany({
    data: ordersData,
  });

  console.log('Inserting trades...');
  await prisma.trade.createMany({
    data: tradesData,
  });

  console.log(`Success! Seeded ${ordersData.length} orders and ${tradesData.length} trades for USDT-INR.`);
}

main()
  .catch((err) => {
    console.error('Error seeding candles:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
