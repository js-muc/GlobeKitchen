SELECT id, shiftid, createdat, submittedby, note
  FROM public."ShiftCashup"
 ORDER BY id DESC
 LIMIT 5;

-- Peek a few JSON fields from snapshot:
SELECT
  (snapshot->'meta'->>'shiftId')::int  AS shift_id,
  snapshot->'meta'->>'createdAt'       AS created_at,
  snapshot->'summary'->'totals'->>'cashDue' AS cash_due
FROM public."ShiftCashup"
ORDER BY id DESC
LIMIT 3;
