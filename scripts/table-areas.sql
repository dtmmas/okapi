CREATE TABLE IF NOT EXISTS `TableArea` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tenantId` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TableArea_tenantId_name_key`(`tenantId`, `name`),
  INDEX `TableArea_tenantId_sortOrder_idx`(`tenantId`, `sortOrder`),
  CONSTRAINT `TableArea_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;