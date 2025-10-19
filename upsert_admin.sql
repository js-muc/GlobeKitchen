DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE email='admin@example.com') THEN
    INSERT INTO "User"(email,password,"createdAt") 
    VALUES ('admin@example.com', crypt('Admin#123', gen_salt('bf',10)), now());
  ELSE
    UPDATE "User" SET password = crypt('Admin#123', gen_salt('bf',10)) WHERE email='admin@example.com';
  END IF;
END $$;
