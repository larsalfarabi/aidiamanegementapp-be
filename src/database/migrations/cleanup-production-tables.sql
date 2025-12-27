-- Cleanup Production Tables
-- Run this if migration failed midway

DROP TABLE IF EXISTS `production_stage_tracking`;
DROP TABLE IF EXISTS `production_material_usage`;
DROP TABLE IF EXISTS `production_batches`;
DROP TABLE IF EXISTS `formula_materials`;
DROP TABLE IF EXISTS `production_formulas`;
