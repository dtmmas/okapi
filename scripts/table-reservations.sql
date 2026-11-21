CREATE TABLE IF NOT EXISTS `TableReservation` (
  `tableId` INTEGER NOT NULL PRIMARY KEY,
  `source` VARCHAR(8) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `address` VARCHAR(250) NOT NULL,
  `guests` INTEGER NOT NULL,
  `kioskKey` VARCHAR(64) NULL,
  CONSTRAINT `TableReservation_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
