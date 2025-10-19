DO GRANT ALL ON SCHEMA public TO gkapp;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gkapp') THEN
    CREATE ROLE gkapp WITH LOGIN PASSWORD 'gkpass';
  ELSE
    ALTER ROLE gkapp WITH LOGIN PASSWORD 'gkpass';
  END IF;
END GRANT ALL ON SCHEMA public TO gkapp;;

ALTER DATABASE globekitchen OWNER TO gkapp;
ALTER SCHEMA public OWNER TO gkapp;
GRANT ALL PRIVILEGES ON DATABASE globekitchen TO gkapp;
GRANT ALL ON SCHEMA public TO gkapp;
