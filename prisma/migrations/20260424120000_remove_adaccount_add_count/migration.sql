-- Drop adaccount table (foreign keys cascade from business and session)
DROP TABLE IF EXISTS `adaccount`;

-- Add adAccountCount column to business table
ALTER TABLE `business` ADD COLUMN `adAccountCount` INTEGER NOT NULL DEFAULT 0;
