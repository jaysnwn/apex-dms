-- =============================================================================
-- APEX DMS — new stock movement types (must be committed before 0015 uses them)
--   stock_out       : goods leaving the warehouse for a reason other than a sale
--                     (sample, internal use, lost, sent for repair ...)
--   purchase_return : goods returned to the supplier against a purchase bill
-- =============================================================================
alter type public.stock_movement_type add value if not exists 'stock_out';
alter type public.stock_movement_type add value if not exists 'purchase_return';
