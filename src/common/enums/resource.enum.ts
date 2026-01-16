export enum Resource {
DASHBOARD = 'dashboard',

  // System Management
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  SETTING = 'setting',

  // Sales & CRM
  CUSTOMER = 'customer',
  ORDER = 'order',

  // Warehouse & Inventory
  PRODUCT = 'product',
  INVENTORY = 'inventory',

  // Production
  FORMULA = 'formula',
  BATCH = 'batch',

  // Reporting
  REPORT = 'report',
}

export enum Action {
  // Basic CRUD
  VIEW = 'view',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',

  // Special Actions
  MANAGE = 'manage',
  ASSIGN = 'assign',
  EXPORT = 'export',
  IMPORT = 'import',

  // Production-specific
  START = 'start', // Start production batch
  CANCEL = 'cancel', // Cancel batch/order
  APPROVE = 'approve', // Approve formula/batch

  // Inventory-specific
  ADJUST = 'adjust', // Stock adjustment
  TRANSFER = 'transfer', // Inter-warehouse transfer
  REPACK = 'repack', // Repacking operation
}
