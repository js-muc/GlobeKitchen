ALTER TABLE public."Shift"       OWNER TO gk;
ALTER TABLE public."SaleLine"    OWNER TO gk;
ALTER TABLE public."ShiftCashup" OWNER TO gk;
ALTER TABLE public."StockAdj"    OWNER TO gk;

ALTER SEQUENCE IF EXISTS public."Shift_id_seq"       OWNER TO gk;
ALTER SEQUENCE IF EXISTS public."SaleLine_id_seq"    OWNER TO gk;
ALTER SEQUENCE IF EXISTS public."ShiftCashup_id_seq" OWNER TO gk;
ALTER SEQUENCE IF EXISTS public."StockAdj_id_seq"    OWNER TO gk;
