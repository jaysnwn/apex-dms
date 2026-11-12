// The fast billing screen lives in billing-screen.tsx. This module keeps the
// name the sales pages import (OrderBuilder). Shared pieces are imported from
// where they live: Dialog from @/components/dialog, RetailerSelect from
// ./retailer-select.
export { BillingScreen as OrderBuilder, type BuilderLine } from "./billing-screen";
