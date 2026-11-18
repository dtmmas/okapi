import {
  PrismaClient,
  RoleCode,
  OrderStatus,
  OrderType,
  PaymentMethod,
  TableStatus,
  PreparationStation,
  PreparationStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function imageUrl(prompt: string) {
  void prompt;
  return null;
}

async function main() {
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cashMovementRecord.deleteMany();
  await prisma.cashShift.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.purchaseReceiptLine.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.wasteRecord.deleteMany();
  await prisma.subRecipeComponent.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.roleProfile.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Restaurante',
      currencyCode: 'GTQ',
      currencySymbol: 'Q',
      branches: {
        create: [
          { name: 'Jacaltenango', city: 'Jacaltenango', address: 'Centro de Jacaltenango, Huehuetenango', phone: '+502 5555 0101' },
        ],
      },
    },
    include: { branches: true },
  });

  const [jacaltenango] = tenant.branches;

  await prisma.user.createMany({
    data: [
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.ADMIN,
        name: 'Camila Rojas',
        email: 'admin@restaurante.gt',
        passwordHash: bcrypt.hashSync('Admin123*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.SUPERVISOR,
        name: 'Diego Montalvo',
        email: 'supervisor@restaurante.gt',
        passwordHash: bcrypt.hashSync('Supervisor123*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.CASHIER,
        name: 'Lucia Soto',
        email: 'cajero@restaurante.gt',
        passwordHash: bcrypt.hashSync('Caja123*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.WAITER,
        name: 'Mesero',
        email: 'mesero@restaurante.gt',
        passwordHash: bcrypt.hashSync('Mesero123*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.KITCHEN,
        name: 'Cocina',
        email: 'cocina@restaurante.gt',
        passwordHash: bcrypt.hashSync('Cocina123*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.BAR,
        name: 'Bar',
        email: 'bar@restaurante.gt',
        passwordHash: bcrypt.hashSync('Bar123456*', 8),
      },
      {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        role: RoleCode.PASTRY,
        name: 'Pastelería',
        email: 'pasteleria@restaurante.gt',
        passwordHash: bcrypt.hashSync('Pastel123*', 8),
      },
    ],
  });

  const cashierUser = await prisma.user.findUnique({ where: { email: 'cajero@restaurante.gt' } });
  const waiterUser = await prisma.user.findUnique({ where: { email: 'mesero@restaurante.gt' } });
  const supervisorUser = await prisma.user.findUnique({ where: { email: 'supervisor@restaurante.gt' } });
  if (cashierUser) {
    await prisma.cashShift.create({
      data: {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        openedById: cashierUser.id,
        openingAmount: 500,
      },
    });
  }

  const [foodGroup, drinksGroup, dessertsGroup] = await Promise.all([
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: 'Platillos',
        color: '#fb7185',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: 'Bebidas',
        color: '#38bdf8',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: 'Postres',
        color: '#fbbf24',
        station: PreparationStation.PASTRY,
      },
    }),
  ]);

  const [
    breakfastsCategory,
    soupsCategory,
    saladsCategory,
    startersCategory,
    grillCategory,
    seafoodCategory,
    pastaCategory,
    sandwichesCategory,
    sidesCategory,
    mainCategory,
    juicesCategory,
    softDrinksCategory,
    coffeesCategory,
    beersCategory,
    winesCategory,
    cocktailsCategory,
    dessertsCategory,
  ] = await Promise.all([
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Desayunos',
        color: '#f472b6',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Sopas',
        color: '#fb923c',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Ensaladas',
        color: '#34d399',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Entradas',
        color: '#a78bfa',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Parrilla',
        color: '#f97316',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Mariscos',
        color: '#60a5fa',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Pastas',
        color: '#fca5a5',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Sándwiches',
        color: '#eab308',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Guarniciones',
        color: '#a3a3a3',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: foodGroup.id,
        name: 'Platos fuertes',
        color: '#fb7185',
        station: PreparationStation.KITCHEN,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Jugos',
        color: '#22c55e',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Bebidas sin alcohol',
        color: '#38bdf8',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Cafés',
        color: '#a16207',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Cervezas',
        color: '#f59e0b',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Vinos',
        color: '#ef4444',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: drinksGroup.id,
        name: 'Cocteles',
        color: '#22c55e',
        station: PreparationStation.BAR,
      },
    }),
    prisma.category.create({
      data: {
        tenantId: tenant.id,
        parentId: dessertsGroup.id,
        name: 'Postres',
        color: '#fbbf24',
        station: PreparationStation.PASTRY,
      },
    }),
  ]);

  const [lomoSaltado, chichaMorada, cheesecake] = await Promise.all([
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Lomo saltado premium',
        sku: 'LOMO-001',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian lomo saltado served on a white plate, golden french fries, glossy sauce, restaurant lighting, shallow depth of field, high detail',
        ),
        price: 44.0,
        isPrepared: true,
      },
    }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: juicesCategory.id,
        name: 'Chicha morada',
        sku: 'BEB-001',
        imageUrl: imageUrl(
          'realistic beverage photography of a glass of chicha morada with ice and condensation droplets, dark background, studio lighting, high detail',
        ),
        price: 8.0,
        isPrepared: false,
      },
    }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Cheesecake lucuma',
        sku: 'POS-001',
        imageUrl: imageUrl(
          'realistic dessert photography of a lucuma cheesecake slice on a ceramic plate, soft lighting, crumb base, creamy texture, restaurant style, high detail',
        ),
        price: 25.0,
        isPrepared: true,
      },
    }),
  ]);

  await prisma.product.createMany({
    data: [
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Huevos revueltos con tostadas',
        sku: 'DES-001',
        imageUrl: imageUrl(
          'realistic breakfast photography of scrambled eggs with toast on a plate, butter, coffee cup in background, warm morning light, high detail',
        ),
        price: 18.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Omelette de jamón y queso',
        sku: 'DES-002',
        imageUrl: imageUrl(
          'realistic breakfast photography of ham and cheese omelette on a plate with side salad, warm light, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Pancakes con miel',
        sku: 'DES-003',
        imageUrl: imageUrl(
          'realistic breakfast photography of pancakes stack with honey and berries, butter melting, restaurant plating, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Tostadas francesas',
        sku: 'DES-004',
        imageUrl: imageUrl(
          'realistic breakfast photography of french toast with powdered sugar and strawberries, syrup, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Bowl de frutas',
        sku: 'DES-005',
        imageUrl: imageUrl(
          'realistic food photography of a fresh fruit bowl with yogurt and granola, bright natural light, high detail',
        ),
        price: 19.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Avena con canela',
        sku: 'DES-006',
        imageUrl: imageUrl(
          'realistic breakfast photography of oatmeal bowl with cinnamon and sliced banana, warm light, high detail',
        ),
        price: 16.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Chilaquiles',
        sku: 'DES-007',
        imageUrl: imageUrl(
          'realistic breakfast photography of chilaquiles with salsa verde, tortilla chips, cream, cheese, onion, restaurant plating, high detail',
        ),
        price: 26.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Huevos benedictinos',
        sku: 'DES-008',
        imageUrl: imageUrl(
          'realistic breakfast photography of eggs benedict with hollandaise sauce on english muffin, poached eggs, crispy bacon, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Molletes',
        sku: 'DES-009',
        imageUrl: imageUrl(
          'realistic breakfast photography of molletes with beans, melted cheese, pico de gallo on top, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: breakfastsCategory.id,
        name: 'Desayuno chapín',
        sku: 'DES-010',
        imageUrl: imageUrl(
          'realistic breakfast photography of Guatemalan breakfast with scrambled eggs, black beans, plantains, crema and tortillas, restaurant lighting, high detail',
        ),
        price: 29.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Causa acevichada',
        sku: 'ENT-001',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian causa acevichada on a plate, creamy yellow potato base, ceviche topping, microgreens, restaurant lighting, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Tequeños de queso',
        sku: 'ENT-002',
        imageUrl: imageUrl(
          'realistic food photography of crispy cheese tequenos served with dipping sauce, golden crust, restaurant lighting, high detail',
        ),
        price: 18.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Anticuchos',
        sku: 'ENT-003',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian anticuchos skewers on a plate, grilled beef heart, char marks, served with potatoes and sauce, restaurant lighting, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Papa a la huancaína',
        sku: 'ENT-004',
        imageUrl: imageUrl(
          'realistic food photography of papa a la huancaina, boiled potato slices with creamy yellow huancaina sauce, olives and egg, on a plate, high detail',
        ),
        price: 16.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Ensalada fresca',
        sku: 'ENT-005',
        imageUrl: imageUrl(
          'realistic food photography of a fresh salad bowl, lettuce, tomato, cucumber, avocado, vinaigrette, bright natural light, high detail',
        ),
        price: 19.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Bruschettas',
        sku: 'ENT-006',
        imageUrl: imageUrl(
          'realistic food photography of bruschetta toasted bread with tomato and basil, olive oil drizzle, high detail',
        ),
        price: 19.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Nachos con queso',
        sku: 'ENT-007',
        imageUrl: imageUrl(
          'realistic food photography of nachos with melted cheese, jalapenos, guacamole, salsa, restaurant lighting, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Guacamole con totopos',
        sku: 'ENT-008',
        imageUrl: imageUrl(
          'realistic food photography of guacamole bowl with tortilla chips, lime wedge, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Alitas BBQ',
        sku: 'ENT-009',
        imageUrl: imageUrl(
          'realistic food photography of barbecue chicken wings on a plate with dipping sauce, restaurant lighting, high detail',
        ),
        price: 32.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: startersCategory.id,
        name: 'Calamares fritos',
        sku: 'ENT-010',
        imageUrl: imageUrl(
          'realistic food photography of fried calamari rings with lemon and aioli, restaurant lighting, high detail',
        ),
        price: 36.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Sopa de pollo',
        sku: 'SOP-001',
        imageUrl: imageUrl(
          'realistic food photography of chicken soup in a bowl, vegetables, steam rising, cozy restaurant lighting, high detail',
        ),
        price: 20.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Sopa de tomate',
        sku: 'SOP-002',
        imageUrl: imageUrl(
          'realistic food photography of creamy tomato soup in a bowl with basil leaf, grilled bread, high detail',
        ),
        price: 18.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Crema de champiñones',
        sku: 'SOP-003',
        imageUrl: imageUrl(
          'realistic food photography of mushroom cream soup in a bowl, parsley garnish, warm lighting, high detail',
        ),
        price: 19.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Sopa de mariscos',
        sku: 'SOP-004',
        imageUrl: imageUrl(
          'realistic food photography of seafood soup in a bowl with shrimp and mussels, steam, restaurant lighting, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Sopa de tortilla',
        sku: 'SOP-005',
        imageUrl: imageUrl(
          'realistic food photography of tortilla soup bowl with avocado slices, tortilla strips, cheese, tomato broth, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Caldo de res',
        sku: 'SOP-006',
        imageUrl: imageUrl(
          'realistic food photography of beef soup with vegetables in a bowl, steam, rustic presentation, high detail',
        ),
        price: 29.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: soupsCategory.id,
        name: 'Sopa minestrone',
        sku: 'SOP-007',
        imageUrl: imageUrl(
          'realistic food photography of minestrone soup with beans and pasta in a bowl, parmesan on top, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada César',
        sku: 'ENS-001',
        imageUrl: imageUrl(
          'realistic food photography of caesar salad in a bowl with croutons and parmesan, bright light, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada caprese',
        sku: 'ENS-002',
        imageUrl: imageUrl(
          'realistic food photography of caprese salad with tomato, mozzarella, basil, olive oil drizzle, high detail',
        ),
        price: 26.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada griega',
        sku: 'ENS-003',
        imageUrl: imageUrl(
          'realistic food photography of greek salad with feta, olives, cucumber and tomato, high detail',
        ),
        price: 26.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada de atún',
        sku: 'ENS-004',
        imageUrl: imageUrl(
          'realistic food photography of tuna salad bowl with lettuce, tomato, olives, boiled egg, high detail',
        ),
        price: 29.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada de quinoa',
        sku: 'ENS-005',
        imageUrl: imageUrl(
          'realistic food photography of quinoa salad bowl with vegetables and herbs, bright light, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: saladsCategory.id,
        name: 'Ensalada de pollo',
        sku: 'ENS-006',
        imageUrl: imageUrl(
          'realistic food photography of chicken salad bowl with grilled chicken slices, greens, dressing, high detail',
        ),
        price: 32.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Ají de gallina',
        sku: 'PLT-002',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian aji de gallina served with rice and boiled potatoes, creamy yellow sauce, restaurant lighting, high detail',
        ),
        price: 34.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Arroz chaufa de pollo',
        sku: 'PLT-003',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian arroz chaufa, fried rice with chicken, scallions, soy sauce, served in bowl, restaurant lighting, high detail',
        ),
        price: 32.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Tallarin saltado',
        sku: 'PLT-004',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian tallarin saltado, stir-fried noodles with beef and vegetables, glossy sauce, restaurant lighting, high detail',
        ),
        price: 33.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Pollo a la brasa (1/4)',
        sku: 'PLT-005',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian pollo a la brasa quarter chicken with fries and salad, crispy skin, restaurant lighting, high detail',
        ),
        price: 35.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Ceviche clásico',
        sku: 'PLT-006',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian ceviche, fresh fish cubes, lime juice, red onion, cilantro, served with sweet potato and corn, high detail',
        ),
        price: 38.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Tacu tacu con lomo',
        sku: 'PLT-007',
        imageUrl: imageUrl(
          'realistic food photography of Peruvian tacu tacu with beef strips, beans and rice cake, restaurant lighting, high detail',
        ),
        price: 42.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Milanesa con papas',
        sku: 'PLT-008',
        imageUrl: imageUrl(
          'realistic food photography of breaded schnitzel with french fries and lemon wedge, restaurant lighting, high detail',
        ),
        price: 36.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Bistec encebollado',
        sku: 'PLT-009',
        imageUrl: imageUrl(
          'realistic food photography of beef steak with caramelized onions and rice, restaurant lighting, high detail',
        ),
        price: 39.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Pollo en crema de champiñones',
        sku: 'PLT-010',
        imageUrl: imageUrl(
          'realistic food photography of chicken in mushroom cream sauce with rice, restaurant lighting, high detail',
        ),
        price: 38.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Filete de pescado a la plancha',
        sku: 'PLT-011',
        imageUrl: imageUrl(
          'realistic food photography of grilled fish fillet with vegetables and lemon, restaurant lighting, high detail',
        ),
        price: 41.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Arroz a la cubana',
        sku: 'PLT-012',
        imageUrl: imageUrl(
          'realistic food photography of rice with fried egg and plantains, simple plating, restaurant lighting, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Churrasco con chimichurri',
        sku: 'PLT-013',
        imageUrl: imageUrl(
          'realistic food photography of churrasco steak with chimichurri, fries side, restaurant lighting, high detail',
        ),
        price: 52.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Bowl pollo teriyaki',
        sku: 'PLT-014',
        imageUrl: imageUrl(
          'realistic food photography of teriyaki chicken bowl with rice and vegetables, sesame seeds, restaurant lighting, high detail',
        ),
        price: 39.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: mainCategory.id,
        name: 'Tacos de birria',
        sku: 'PLT-015',
        imageUrl: imageUrl(
          'realistic food photography of birria tacos with consommé, onions, cilantro, restaurant lighting, high detail',
        ),
        price: 44.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Picanha a la parrilla',
        sku: 'PAR-001',
        imageUrl: imageUrl(
          'realistic food photography of grilled picanha steak sliced on a wooden board, grill marks, chimichurri sauce, restaurant lighting, high detail',
        ),
        price: 58.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Costillas BBQ',
        sku: 'PAR-002',
        imageUrl: imageUrl(
          'realistic food photography of barbecue ribs glazed with sauce on a plate, fries side, restaurant lighting, high detail',
        ),
        price: 54.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Pollo a la parrilla',
        sku: 'PAR-003',
        imageUrl: imageUrl(
          'realistic food photography of grilled chicken breast with vegetables, grill marks, restaurant lighting, high detail',
        ),
        price: 38.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Chorizo parrillero',
        sku: 'PAR-004',
        imageUrl: imageUrl(
          'realistic food photography of grilled chorizo sausage sliced, served with chimichurri, rustic board, high detail',
        ),
        price: 32.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Mixto parrillero',
        sku: 'PAR-005',
        imageUrl: imageUrl(
          'realistic food photography of mixed grill platter with steak, chicken, sausage and vegetables, restaurant lighting, high detail',
        ),
        price: 72.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Brochetas de pollo',
        sku: 'PAR-006',
        imageUrl: imageUrl(
          'realistic food photography of grilled chicken skewers with vegetables, grill marks, restaurant lighting, high detail',
        ),
        price: 36.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Punta de anca',
        sku: 'PAR-007',
        imageUrl: imageUrl(
          'realistic food photography of grilled sirloin steak on a plate, chimichurri, restaurant lighting, high detail',
        ),
        price: 60.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: grillCategory.id,
        name: 'Lomo fino',
        sku: 'PAR-008',
        imageUrl: imageUrl(
          'realistic food photography of grilled filet mignon with sauce and mashed potatoes, restaurant lighting, high detail',
        ),
        price: 68.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Camarones al ajillo',
        sku: 'MAR-001',
        imageUrl: imageUrl(
          'realistic food photography of garlic shrimp in a skillet, parsley garnish, restaurant lighting, high detail',
        ),
        price: 46.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Pulpo a la parrilla',
        sku: 'MAR-002',
        imageUrl: imageUrl(
          'realistic food photography of grilled octopus on a plate with potatoes, olive oil drizzle, restaurant lighting, high detail',
        ),
        price: 62.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Arroz con mariscos',
        sku: 'MAR-003',
        imageUrl: imageUrl(
          'realistic food photography of seafood rice dish in a bowl, shrimp and mussels, saffron color, restaurant lighting, high detail',
        ),
        price: 55.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Salmón a la plancha',
        sku: 'MAR-004',
        imageUrl: imageUrl(
          'realistic food photography of grilled salmon fillet with vegetables and lemon, restaurant lighting, high detail',
        ),
        price: 64.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Fish and chips',
        sku: 'MAR-005',
        imageUrl: imageUrl(
          'realistic food photography of fish and chips on a plate with tartar sauce and lemon, restaurant lighting, high detail',
        ),
        price: 45.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: seafoodCategory.id,
        name: 'Ceviche mixto',
        sku: 'MAR-006',
        imageUrl: imageUrl(
          'realistic food photography of mixed ceviche with shrimp and fish, red onion, cilantro, lime, high detail',
        ),
        price: 49.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Pasta alfredo',
        sku: 'PAS-001',
        imageUrl: imageUrl(
          'realistic food photography of creamy alfredo pasta in a bowl with parmesan, restaurant lighting, high detail',
        ),
        price: 36.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Spaghetti bolognese',
        sku: 'PAS-002',
        imageUrl: imageUrl(
          'realistic food photography of spaghetti bolognese with meat sauce and parmesan, restaurant lighting, high detail',
        ),
        price: 38.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Pasta pesto',
        sku: 'PAS-003',
        imageUrl: imageUrl(
          'realistic food photography of pesto pasta with basil and pine nuts, restaurant lighting, high detail',
        ),
        price: 35.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Lasagna',
        sku: 'PAS-004',
        imageUrl: imageUrl(
          'realistic food photography of lasagna slice with melted cheese, tomato sauce, restaurant lighting, high detail',
        ),
        price: 42.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Pasta carbonara',
        sku: 'PAS-005',
        imageUrl: imageUrl(
          'realistic food photography of spaghetti carbonara with bacon, creamy sauce, parmesan, restaurant lighting, high detail',
        ),
        price: 41.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: pastaCategory.id,
        name: 'Pasta marinara',
        sku: 'PAS-006',
        imageUrl: imageUrl(
          'realistic food photography of pasta with seafood marinara sauce, shrimp and mussels, restaurant lighting, high detail',
        ),
        price: 52.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Hamburguesa clásica',
        sku: 'SAN-001',
        imageUrl: imageUrl(
          'realistic food photography of a classic cheeseburger with fries, sesame bun, restaurant lighting, high detail',
        ),
        price: 32.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Sándwich de pollo crispy',
        sku: 'SAN-002',
        imageUrl: imageUrl(
          'realistic food photography of crispy chicken sandwich with lettuce and sauce, restaurant lighting, high detail',
        ),
        price: 30.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Club sandwich',
        sku: 'SAN-003',
        imageUrl: imageUrl(
          'realistic food photography of club sandwich cut in triangles with fries, restaurant lighting, high detail',
        ),
        price: 34.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Hamburguesa doble',
        sku: 'SAN-004',
        imageUrl: imageUrl(
          'realistic food photography of double cheeseburger with fries, juicy patties, restaurant lighting, high detail',
        ),
        price: 42.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Sándwich vegetariano',
        sku: 'SAN-005',
        imageUrl: imageUrl(
          'realistic food photography of vegetarian sandwich with grilled vegetables, avocado, fresh bread, restaurant lighting, high detail',
        ),
        price: 30.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sandwichesCategory.id,
        name: 'Hot dog gourmet',
        sku: 'SAN-006',
        imageUrl: imageUrl(
          'realistic food photography of gourmet hot dog with toppings, fries side, restaurant lighting, high detail',
        ),
        price: 28.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Papas fritas',
        sku: 'GUA-001',
        imageUrl: imageUrl(
          'realistic food photography of golden french fries in a bowl with ketchup, restaurant lighting, high detail',
        ),
        price: 12.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Arroz blanco',
        sku: 'GUA-002',
        imageUrl: imageUrl(
          'realistic food photography of steamed white rice in a bowl, clean background, high detail',
        ),
        price: 10.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Puré de papa',
        sku: 'GUA-003',
        imageUrl: imageUrl(
          'realistic food photography of creamy mashed potatoes on a plate, butter melting, high detail',
        ),
        price: 12.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Vegetales salteados',
        sku: 'GUA-004',
        imageUrl: imageUrl(
          'realistic food photography of sauteed mixed vegetables in a bowl, glossy, restaurant lighting, high detail',
        ),
        price: 14.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Yuca frita',
        sku: 'GUA-005',
        imageUrl: imageUrl(
          'realistic food photography of fried yucca sticks with dipping sauce, restaurant lighting, high detail',
        ),
        price: 14.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: sidesCategory.id,
        name: 'Tortillas',
        sku: 'GUA-006',
        imageUrl: imageUrl(
          'realistic food photography of warm corn tortillas in a basket with cloth, restaurant lighting, high detail',
        ),
        price: 10.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: juicesCategory.id,
        name: 'Jugo de naranja',
        sku: 'JUG-001',
        imageUrl: imageUrl(
          'realistic beverage photography of orange juice in a glass with ice, bright color, studio lighting, high detail',
        ),
        price: 9.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: juicesCategory.id,
        name: 'Jugo verde',
        sku: 'JUG-002',
        imageUrl: imageUrl(
          'realistic beverage photography of green juice in a glass with cucumber and mint, studio lighting, high detail',
        ),
        price: 11.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: softDrinksCategory.id,
        name: 'Té helado',
        sku: 'BEB-006',
        imageUrl: imageUrl(
          'realistic beverage photography of iced tea in a tall glass with lemon slice and ice, condensation droplets, studio lighting, high detail',
        ),
        price: 9.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: softDrinksCategory.id,
        name: 'Agua saborizada',
        sku: 'BEB-007',
        imageUrl: imageUrl(
          'realistic beverage photography of flavored water with fruit slices in a glass, bright light, high detail',
        ),
        price: 8.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: softDrinksCategory.id,
        name: 'Limonada frozen',
        sku: 'BEB-002',
        imageUrl: imageUrl(
          'realistic beverage photography of frozen lemonade in a glass with mint and lime slice, condensation droplets, studio lighting, high detail',
        ),
        price: 9.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: juicesCategory.id,
        name: 'Maracuyá',
        sku: 'BEB-003',
        imageUrl: imageUrl(
          'realistic beverage photography of passion fruit juice in a glass with ice, bright yellow color, studio lighting, high detail',
        ),
        price: 9.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: softDrinksCategory.id,
        name: 'Gaseosa',
        sku: 'BEB-004',
        imageUrl: imageUrl(
          'realistic beverage photography of cola soda with ice in a glass, condensation droplets, dark background, studio lighting, high detail',
        ),
        price: 6.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: softDrinksCategory.id,
        name: 'Agua mineral',
        sku: 'BEB-005',
        imageUrl: imageUrl(
          'realistic beverage photography of sparkling water bottle and glass with ice, clean minimal background, studio lighting, high detail',
        ),
        price: 5.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Espresso',
        sku: 'CAF-001',
        imageUrl: imageUrl(
          'realistic coffee photography of espresso shot in a small cup, crema, dark background, high detail',
        ),
        price: 7.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Americano',
        sku: 'CAF-002',
        imageUrl: imageUrl(
          'realistic coffee photography of americano in a ceramic cup, steam, cafe table, high detail',
        ),
        price: 8.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Capuccino',
        sku: 'CAF-003',
        imageUrl: imageUrl(
          'realistic coffee photography of cappuccino with latte art, foam, cafe lighting, high detail',
        ),
        price: 12.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Latte',
        sku: 'CAF-004',
        imageUrl: imageUrl(
          'realistic coffee photography of latte with milk foam, cafe lighting, high detail',
        ),
        price: 12.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Mocha',
        sku: 'CAF-005',
        imageUrl: imageUrl(
          'realistic coffee photography of mocha coffee with chocolate drizzle, cafe lighting, high detail',
        ),
        price: 14.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Chocolate caliente',
        sku: 'CAF-006',
        imageUrl: imageUrl(
          'realistic beverage photography of hot chocolate in a mug with whipped cream, cozy lighting, high detail',
        ),
        price: 14.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: coffeesCategory.id,
        name: 'Té de manzanilla',
        sku: 'CAF-007',
        imageUrl: imageUrl(
          'realistic beverage photography of chamomile tea in a cup, steam, minimal background, high detail',
        ),
        price: 9.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: beersCategory.id,
        name: 'Cerveza rubia (330ml)',
        sku: 'CER-001',
        imageUrl: imageUrl(
          'realistic beverage photography of a blonde beer bottle and glass with foam, bar lighting, high detail',
        ),
        price: 14.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: beersCategory.id,
        name: 'Cerveza negra (330ml)',
        sku: 'CER-002',
        imageUrl: imageUrl(
          'realistic beverage photography of a dark stout beer in a glass with foam, bar lighting, high detail',
        ),
        price: 16.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: beersCategory.id,
        name: 'Cerveza artesanal IPA',
        sku: 'CER-003',
        imageUrl: imageUrl(
          'realistic beverage photography of craft IPA beer in a glass, amber color, bar lighting, high detail',
        ),
        price: 18.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: beersCategory.id,
        name: 'Cerveza lager (pinta)',
        sku: 'CER-004',
        imageUrl: imageUrl(
          'realistic beverage photography of lager beer pint glass with foam, bar lighting, high detail',
        ),
        price: 20.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: winesCategory.id,
        name: 'Vino tinto (copa)',
        sku: 'VIN-001',
        imageUrl: imageUrl(
          'realistic wine photography of a glass of red wine on a table, moody restaurant lighting, high detail',
        ),
        price: 22.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: winesCategory.id,
        name: 'Vino blanco (copa)',
        sku: 'VIN-002',
        imageUrl: imageUrl(
          'realistic wine photography of a glass of white wine with condensation, restaurant lighting, high detail',
        ),
        price: 22.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: winesCategory.id,
        name: 'Vino rosé (copa)',
        sku: 'VIN-003',
        imageUrl: imageUrl(
          'realistic wine photography of a glass of rose wine, soft lighting, high detail',
        ),
        price: 22.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: winesCategory.id,
        name: 'Espumante (copa)',
        sku: 'VIN-004',
        imageUrl: imageUrl(
          'realistic wine photography of sparkling wine in a flute glass, bubbles, restaurant lighting, high detail',
        ),
        price: 24.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Pisco sour',
        sku: 'COC-001',
        imageUrl: imageUrl(
          'realistic cocktail photography of a pisco sour in a coupe glass with foam and bitters on top, dark bar background, dramatic lighting, high detail',
        ),
        price: 22.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Mojito',
        sku: 'COC-002',
        imageUrl: imageUrl(
          'realistic cocktail photography of a mojito with mint and lime, crushed ice, condensation, bar lighting, high detail',
        ),
        price: 20.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Gin tonic',
        sku: 'COC-003',
        imageUrl: imageUrl(
          'realistic cocktail photography of a gin and tonic in a balloon glass with rosemary and citrus, ice cubes, bar lighting, high detail',
        ),
        price: 24.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Margarita',
        sku: 'COC-004',
        imageUrl: imageUrl(
          'realistic cocktail photography of a margarita in a glass with salted rim and lime wedge, bar lighting, high detail',
        ),
        price: 23.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Piña colada',
        sku: 'COC-005',
        imageUrl: imageUrl(
          'realistic cocktail photography of pina colada in a glass with pineapple slice, tropical look, bar lighting, high detail',
        ),
        price: 24.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: cocktailsCategory.id,
        name: 'Negroni',
        sku: 'COC-006',
        imageUrl: imageUrl(
          'realistic cocktail photography of negroni in a rocks glass with orange peel, bar lighting, high detail',
        ),
        price: 26.0,
        isPrepared: false,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Suspiro a la limeña',
        sku: 'POS-002',
        imageUrl: imageUrl(
          'realistic dessert photography of suspiro a la limena in a glass cup with cinnamon dust, soft lighting, high detail',
        ),
        price: 18.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Torta de chocolate',
        sku: 'POS-003',
        imageUrl: imageUrl(
          'realistic dessert photography of a chocolate cake slice with ganache, served on a plate, soft lighting, high detail',
        ),
        price: 20.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Pie de limón',
        sku: 'POS-004',
        imageUrl: imageUrl(
          'realistic dessert photography of a lemon pie slice with meringue topping, served on a plate, soft lighting, high detail',
        ),
        price: 19.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Helado artesanal',
        sku: 'POS-005',
        imageUrl: imageUrl(
          'realistic dessert photography of artisan ice cream scoops in a bowl with wafer, soft lighting, high detail',
        ),
        price: 16.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Brownie con helado',
        sku: 'POS-006',
        imageUrl: imageUrl(
          'realistic dessert photography of warm chocolate brownie with vanilla ice cream scoop, chocolate sauce drizzle, soft lighting, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Crema volteada',
        sku: 'POS-007',
        imageUrl: imageUrl(
          'realistic dessert photography of caramel flan on a plate, glossy caramel, soft lighting, high detail',
        ),
        price: 18.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Tres leches',
        sku: 'POS-008',
        imageUrl: imageUrl(
          'realistic dessert photography of tres leches cake slice with whipped cream, soft lighting, high detail',
        ),
        price: 20.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Panqueques con dulce de leche',
        sku: 'POS-009',
        imageUrl: imageUrl(
          'realistic dessert photography of crepes with dulce de leche, powdered sugar, soft lighting, high detail',
        ),
        price: 22.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Cheesecake de fresa',
        sku: 'POS-010',
        imageUrl: imageUrl(
          'realistic dessert photography of strawberry cheesecake slice with strawberry topping, soft lighting, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
      {
        tenantId: tenant.id,
        categoryId: dessertsCategory.id,
        name: 'Tiramisú',
        sku: 'POS-011',
        imageUrl: imageUrl(
          'realistic dessert photography of tiramisu portion with cocoa powder, coffee aroma, soft lighting, high detail',
        ),
        price: 24.0,
        isPrepared: true,
      },
    ],
  });

  const sampleInventoryItems = [
    { name: 'Lomo fino', unit: 'kg', stock: 18, minStock: 12, unitCost: 62, supplier: 'Carnes del Pacifico' },
    { name: 'Papa amarilla', unit: 'kg', stock: 35, minStock: 14, unitCost: 9, supplier: 'Agro Andino' },
    { name: 'Cebolla roja', unit: 'kg', stock: 12, minStock: 5, unitCost: 6.5, supplier: 'Huerta Central' },
    { name: 'Tomate roma', unit: 'kg', stock: 10, minStock: 5, unitCost: 7.2, supplier: 'Huerta Central' },
    { name: 'Salsa de soya', unit: 'lt', stock: 8, minStock: 3, unitCost: 18, supplier: 'Distribuidora Oriente' },
    { name: 'Culantro fresco', unit: 'kg', stock: 2.5, minStock: 1, unitCost: 14, supplier: 'Huerta Central' },
    { name: 'Limon persa', unit: 'kg', stock: 8, minStock: 4, unitCost: 11, supplier: 'Frutas Selectas' },
    { name: 'Aji amarillo pasta', unit: 'kg', stock: 5, minStock: 2, unitCost: 24, supplier: 'Andes Food Service' },
    { name: 'Pechuga de pollo', unit: 'kg', stock: 16, minStock: 8, unitCost: 31, supplier: 'Avicola La Granja' },
    { name: 'Fettuccine', unit: 'kg', stock: 9, minStock: 3, unitCost: 19, supplier: 'Pastas del Chef' },
    { name: 'Crema fresca', unit: 'lt', stock: 6, minStock: 2, unitCost: 22, supplier: 'Lacteos Sierra' },
    { name: 'Harina', unit: 'kg', stock: 14, minStock: 5, unitCost: 5.2, supplier: 'Molinos Premium' },
    { name: 'Queso mozzarella', unit: 'kg', stock: 6, minStock: 2, unitCost: 38, supplier: 'Lacteos Sierra' },
    { name: 'Queso parmesano', unit: 'kg', stock: 4, minStock: 1.5, unitCost: 52, supplier: 'Lacteos Sierra' },
    { name: 'Azucar', unit: 'kg', stock: 18, minStock: 6, unitCost: 6.8, supplier: 'Central Mayorista' },
    { name: 'Queso crema', unit: 'kg', stock: 7, minStock: 3, unitCost: 41, supplier: 'Lacteos Sierra' },
    { name: 'Galleta vainilla', unit: 'kg', stock: 11, minStock: 4, unitCost: 12, supplier: 'Reposteria Supply' },
    { name: 'Pulpa de lucuma', unit: 'kg', stock: 5, minStock: 2, unitCost: 28, supplier: 'Frutas Selectas' },
    { name: 'Maiz morado', unit: 'kg', stock: 8, minStock: 3, unitCost: 13, supplier: 'Andes Food Service' },
    { name: 'Piña golden', unit: 'kg', stock: 14, minStock: 6, unitCost: 8.5, supplier: 'Frutas Selectas' },
    { name: 'Canela en raja', unit: 'kg', stock: 1.2, minStock: 0.4, unitCost: 36, supplier: 'Especias del Sol' },
  ] as const;

  await prisma.inventoryItem.createMany({
    data: sampleInventoryItems.map((item) => ({
      branchId: jacaltenango.id,
      ...item,
    })),
  });

  const inventoryRows = await prisma.inventoryItem.findMany({
    where: { branchId: jacaltenango.id },
    select: { id: true, name: true },
  });
  const inventoryByName = new Map(inventoryRows.map((item) => [item.name, item.id]));

  const sampleProducts = await prisma.product.findMany({
    where: {
      tenantId: tenant.id,
      sku: {
        in: ['LOMO-001', 'BEB-001', 'POS-001', 'ENT-001', 'ENT-002', 'PAS-001'],
      },
    },
    select: { id: true, sku: true },
  });
  const productBySku = new Map(sampleProducts.map((item) => [item.sku ?? '', item.id]));

  const recipeRows = [
    ['LOMO-001', 'Lomo fino', 0.25],
    ['LOMO-001', 'Papa amarilla', 0.3],
    ['LOMO-001', 'Cebolla roja', 0.08],
    ['LOMO-001', 'Tomate roma', 0.1],
    ['LOMO-001', 'Salsa de soya', 0.03],
    ['LOMO-001', 'Culantro fresco', 0.01],
    ['BEB-001', 'Maiz morado', 0.12],
    ['BEB-001', 'Piña golden', 0.1],
    ['BEB-001', 'Canela en raja', 0.005],
    ['BEB-001', 'Azucar', 0.08],
    ['POS-001', 'Queso crema', 0.12],
    ['POS-001', 'Galleta vainilla', 0.08],
    ['POS-001', 'Pulpa de lucuma', 0.09],
    ['ENT-001', 'Papa amarilla', 0.25],
    ['ENT-001', 'Aji amarillo pasta', 0.035],
    ['ENT-001', 'Limon persa', 0.03],
    ['ENT-001', 'Culantro fresco', 0.005],
    ['ENT-002', 'Queso mozzarella', 0.06],
    ['ENT-002', 'Harina', 0.08],
    ['PAS-001', 'Pechuga de pollo', 0.18],
    ['PAS-001', 'Fettuccine', 0.14],
    ['PAS-001', 'Crema fresca', 0.1],
    ['PAS-001', 'Queso parmesano', 0.035],
  ] as const;

  await prisma.recipe.createMany({
    data: recipeRows
      .map(([sku, itemName, quantity]) => {
        const productId = productBySku.get(sku);
        const inventoryItemId = inventoryByName.get(itemName);

        if (!productId || !inventoryItemId) {
          return null;
        }

        return {
          branchId: jacaltenango.id,
          productId,
          inventoryItemId,
          quantity,
        };
      })
      .filter((item): item is { branchId: number; productId: number; inventoryItemId: number; quantity: number } => item !== null),
  });

  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Andrea Paredes',
      phone: '+51 999 401 100',
      email: 'andrea@cliente.pe',
      points: 1240,
      creditLimit: 300,
      creditUsed: 80,
    },
  });

  const [table, tableTwo, tableThree] = await Promise.all([
    prisma.restaurantTable.create({
      data: {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        code: 'M08',
        area: 'Salon principal',
        capacity: 4,
        status: TableStatus.OCCUPIED,
      },
    }),
    prisma.restaurantTable.create({
      data: {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        code: 'M11',
        area: 'Barra',
        capacity: 2,
        status: TableStatus.RESERVED,
      },
    }),
    prisma.restaurantTable.create({
      data: {
        tenantId: tenant.id,
        branchId: jacaltenango.id,
        code: 'M14',
        area: 'VIP',
        capacity: 8,
        status: TableStatus.FREE,
      },
    }),
  ]);

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      branchId: jacaltenango.id,
      tableId: table.id,
      customerId: customer.id,
      createdById: waiterUser?.id ?? cashierUser?.id ?? null,
      code: 'ORD-501',
      type: OrderType.DINE_IN,
      status: OrderStatus.IN_PREPARATION,
      total: 182,
      channel: 'Salon',
      items: {
        create: [
          {
            productId: lomoSaltado.id,
            quantity: 2,
            unitPrice: 44,
            notes: '1 sin cebolla',
            station: PreparationStation.KITCHEN,
            status: PreparationStatus.IN_PREPARATION,
          },
          {
            productId: chichaMorada.id,
            quantity: 2,
            unitPrice: 8,
            station: PreparationStation.BAR,
            status: PreparationStatus.PENDING,
          },
        ],
      },
      payments: {
        create: [
          { method: PaymentMethod.CASH, amount: 100 },
          { method: PaymentMethod.CARD, amount: 82 },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      branchId: jacaltenango.id,
      customerId: customer.id,
      createdById: supervisorUser?.id ?? waiterUser?.id ?? cashierUser?.id ?? null,
      code: 'ORD-502',
      type: OrderType.DELIVERY,
      status: OrderStatus.READY,
      total: 96,
      channel: 'Delivery web',
      items: {
        create: [
          {
            productId: lomoSaltado.id,
            quantity: 1,
            unitPrice: 44,
            station: PreparationStation.KITCHEN,
            status: PreparationStatus.READY,
          },
          {
            productId: cheesecake.id,
            quantity: 1,
            unitPrice: 25,
            station: PreparationStation.PASTRY,
            status: PreparationStatus.READY,
          },
          {
            productId: chichaMorada.id,
            quantity: 1,
            unitPrice: 8,
            station: PreparationStation.BAR,
            status: PreparationStatus.READY,
          },
        ],
      },
      payments: {
        create: [{ method: PaymentMethod.CARD, amount: 96 }],
      },
    },
  });

  console.log('Seed completado', {
    tenantId: tenant.id,
    branchIds: [jacaltenango.id],
    tableIds: [table.id, tableTwo.id, tableThree.id],
    orderId: order.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
