\getenv app_password POSTGRES_APP_PASSWORD
\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD
\getenv database_name POSTGRES_DB
\getenv shadow_database POSTGRES_SHADOW_DB

SELECT format(
  'CREATE ROLE balancevault_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
  :'app_password'
) \gexec

SELECT format(
  'CREATE ROLE balancevault_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
  :'migrator_password'
) \gexec

SELECT format('CREATE DATABASE %I OWNER balancevault_migrator', :'shadow_database') \gexec

GRANT CONNECT ON DATABASE :"database_name" TO balancevault_app, balancevault_migrator;
GRANT USAGE ON SCHEMA public TO balancevault_app;
GRANT USAGE, CREATE ON SCHEMA public TO balancevault_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE balancevault_migrator IN SCHEMA public
  GRANT SELECT, INSERT ON TABLES TO balancevault_app;
ALTER DEFAULT PRIVILEGES FOR ROLE balancevault_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO balancevault_app;