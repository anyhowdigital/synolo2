CREATE UNIQUE INDEX IF NOT EXISTS `invoices_org_series_number_unique` ON `invoices` (`org_id`, `series_id`, `number`) WHERE `status` != 'draft';
