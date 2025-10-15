-- =====================================================
-- Migration: Create inventory_daily_snapshots table
-- Date: October 13, 2025
-- Purpose: Store daily inventory snapshots for historical reporting
-- =====================================================

CREATE TABLE IF NOT EXISTS `inventory_daily_snapshots` (
  -- Primary Key
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  
  -- Snapshot Info
  `snapshotDate` DATE NOT NULL COMMENT 'Date of the snapshot (e.g., 2025-10-13)',
  `snapshotCreatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this snapshot was created (usually ~00:00 next day)',
  `isManualSnapshot` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'True if manually triggered (vs auto-generated)',
  
  -- Product Relations
  `productCodeId` INT NOT NULL COMMENT 'FK to product_codes table',
  `inventoryId` INT NOT NULL COMMENT 'FK to inventory table',
  
  -- Stock Positions (Daily Metrics)
  `openingStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Stock at start of day (00:00)',
  `incomingStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Total IN transactions (PRODUCTION_IN + SALE_RETURN + ADJUSTMENT_IN)',
  `outgoingStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Total OUT transactions (SALE + WASTE + ADJUSTMENT_OUT)',
  `orderedStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Orders created/confirmed on this day (CONFIRMED + SHIPPED status)',
  `availableStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Calculated: openingStock + incomingStock - orderedStock',
  `closingStock` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Stock at end of day (23:59) - becomes next day opening',
  
  -- Transaction Counts (Analytics)
  `productionCount` INT NOT NULL DEFAULT 0 COMMENT 'Number of PRODUCTION_IN transactions',
  `saleCount` INT NOT NULL DEFAULT 0 COMMENT 'Number of SALE transactions',
  `wasteCount` INT NOT NULL DEFAULT 0 COMMENT 'Number of WASTE transactions',
  `adjustmentCount` INT NOT NULL DEFAULT 0 COMMENT 'Number of ADJUSTMENT transactions (IN + OUT)',
  `orderCount` INT NOT NULL DEFAULT 0 COMMENT 'Number of orders created/confirmed',
  
  -- Stock Status at Snapshot Time
  `stockStatus` ENUM('OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE', 'OVERSTOCK') NOT NULL DEFAULT 'AVAILABLE',
  
  -- Notes
  `notes` TEXT NULL COMMENT 'Any special notes for the day (e.g., "Stock opname conducted")',
  
  -- Audit Fields (from BaseEntity)
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` TIMESTAMP NULL DEFAULT NULL,
  `createdBy` INT NULL,
  `updatedBy` INT NULL,
  `deletedBy` INT NULL,
  
  -- Indexes
  INDEX `idx_snapshot_date` (`snapshotDate`),
  INDEX `idx_product_code` (`productCodeId`),
  INDEX `idx_inventory` (`inventoryId`),
  INDEX `idx_stock_status` (`stockStatus`),
  INDEX `idx_snapshot_date_product` (`snapshotDate`, `productCodeId`),
  
  -- Unique Constraint: One snapshot per product per day
  UNIQUE KEY `uq_snapshot_product_date` (`productCodeId`, `snapshotDate`),
  
  -- Foreign Keys
  CONSTRAINT `fk_daily_snapshot_product_code`
    FOREIGN KEY (`productCodeId`)
    REFERENCES `product_codes` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
    
  CONSTRAINT `fk_daily_snapshot_inventory`
    FOREIGN KEY (`inventoryId`)
    REFERENCES `inventory` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
    
  CONSTRAINT `fk_daily_snapshot_created_by`
    FOREIGN KEY (`createdBy`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
    
  CONSTRAINT `fk_daily_snapshot_updated_by`
    FOREIGN KEY (`updatedBy`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
    
  CONSTRAINT `fk_daily_snapshot_deleted_by`
    FOREIGN KEY (`deletedBy`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Daily inventory snapshots for historical reporting and analytics';

-- =====================================================
-- Sample Data Query (Optional - for testing)
-- =====================================================
-- This is an example of how snapshots will be created by the cron job
-- DO NOT RUN THIS IN PRODUCTION without modifying dates/values

/*
INSERT INTO `inventory_daily_snapshots` (
  `snapshotDate`,
  `productCodeId`,
  `inventoryId`,
  `openingStock`,
  `incomingStock`,
  `outgoingStock`,
  `orderedStock`,
  `availableStock`,
  `closingStock`,
  `productionCount`,
  `orderCount`,
  `stockStatus`,
  `notes`
) VALUES
  ('2025-10-12', 1, 1, 100.00, 50.00, 20.00, 30.00, 120.00, 130.00, 2, 3, 'AVAILABLE', 'Normal production day'),
  ('2025-10-12', 2, 2, 200.00, 0.00, 10.00, 50.00, 150.00, 190.00, 0, 5, 'AVAILABLE', NULL),
  ('2025-10-12', 3, 3, 50.00, 100.00, 0.00, 80.00, 70.00, 150.00, 3, 8, 'LOW_STOCK', 'High demand today');
*/

-- =====================================================
-- Verification Queries
-- =====================================================

-- Check table structure
DESCRIBE `inventory_daily_snapshots`;

-- Check indexes
SHOW INDEX FROM `inventory_daily_snapshots`;

-- Check constraints
SELECT 
  CONSTRAINT_NAME,
  CONSTRAINT_TYPE,
  TABLE_NAME
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_daily_snapshots';

-- =====================================================
-- Rollback Query (if needed)
-- =====================================================
-- DROP TABLE IF EXISTS `inventory_daily_snapshots`;
