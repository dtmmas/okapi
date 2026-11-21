ALTER TABLE `RestaurantTable`
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `RestaurantTable_branchId_area_sortOrder_idx` ON `RestaurantTable`(`branchId`, `area`, `sortOrder`);