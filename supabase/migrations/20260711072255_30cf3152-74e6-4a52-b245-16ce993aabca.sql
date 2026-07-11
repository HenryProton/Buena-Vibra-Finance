ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'consolidado';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS consolidated_into UUID REFERENCES public.loans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_loans_consolidated_into ON public.loans(consolidated_into);