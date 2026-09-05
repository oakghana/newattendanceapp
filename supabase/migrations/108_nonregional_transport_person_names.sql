BEGIN;

ALTER TABLE public.nonregional_transport_requisitions
  ADD COLUMN IF NOT EXISTS person_names text;

-- Preserve names from legacy text values such as "2 people: Ama Mensah"
-- before normalizing the headcount column.
UPDATE public.nonregional_transport_requisitions
SET person_names = NULLIF(
  trim(
    regexp_replace(
      persons_requiring_transport::text,
      '^\s*[0-9]+\s*(people|person)?\s*[:—-]?\s*',
      '',
      'i'
    )
  ),
  ''
)
WHERE person_names IS NULL
  AND persons_requiring_transport::text ~ '^\s*[0-9]+\s*(people|person)?\s*[:-]\s*.+$';

DO $$
DECLARE
  column_type text;
BEGIN
  SELECT data_type
  INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'nonregional_transport_requisitions'
    AND column_name = 'persons_requiring_transport';

  IF column_type IN ('text', 'character varying', 'character') THEN
    ALTER TABLE public.nonregional_transport_requisitions
      ALTER COLUMN persons_requiring_transport TYPE integer
      USING CASE
        WHEN trim(persons_requiring_transport::text) ~ '^\s*[0-9]+'
          THEN substring(trim(persons_requiring_transport::text) from '^\s*([0-9]+)')::integer
        ELSE 1
      END;
  END IF;
END $$;

UPDATE public.nonregional_transport_requisitions
SET persons_requiring_transport = 1
WHERE persons_requiring_transport IS NULL OR persons_requiring_transport < 1;

ALTER TABLE public.nonregional_transport_requisitions
  ALTER COLUMN persons_requiring_transport SET NOT NULL;

COMMIT;
