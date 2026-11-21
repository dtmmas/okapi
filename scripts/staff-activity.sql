-- Run once, before starting the version that records staff activity.
ALTER TABLE `Order` ADD COLUMN `openedByName` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `collectedByName` VARCHAR(191) NULL;
CREATE TABLE `StaffActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `actorId` INTEGER NOT NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `actorRole` ENUM('ADMIN','SUPERVISOR','CASHIER','WAITER','KITCHEN','BAR','PASTRY','DELIVERY','KIOSK') NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `StaffActivity_tenantId_createdAt_idx` (`tenantId`, `createdAt`),
    INDEX `StaffActivity_tenantId_branchId_actorId_createdAt_idx` (`tenantId`, `branchId`, `actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
