INSERT INTO "User" ("email","password","createdAt")
VALUES ('admin@globekitchen.local', crypt('Admin#123', gen_salt('bf',10)), now())
ON CONFLICT ("email") DO UPDATE SET "password" = EXCLUDED."password";
