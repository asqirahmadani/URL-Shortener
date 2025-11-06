#!/bin/bash

echo "================================"
echo "🔍 DATABASE VERIFICATION"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DB_CONTAINER="url-shortener-db"
DB_USER="urlshortener"
DB_NAME="urlshortener_db"

echo "📊 1. Checking Tables..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dt"
echo ""

echo "📋 2. Checking URLs Table Structure..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\d urls"
echo ""

echo "📋 3. Checking Clicks Table Structure..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\d clicks"
echo ""

echo "🔗 4. Checking Foreign Keys..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('urls', 'clicks');
"
echo ""

echo "📇 5. Checking Indexes..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('urls', 'clicks')
ORDER BY tablename, indexname;
"
echo ""

echo "🧩 6. Checking Extensions..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dx"
echo ""

echo "✅ 7. Checking Soft Delete Columns..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('urls', 'clicks')
AND column_name = 'deletedAt';
"
echo ""

echo "📊 8. Sample Data Test..."
docker exec -it $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
-- Insert test URL
INSERT INTO urls (\"originalUrl\", \"shortCode\", \"isActive\")
VALUES ('https://example.com', 'test123', true)
ON CONFLICT (\"shortCode\") DO NOTHING
RETURNING id, \"shortCode\", \"originalUrl\";

-- Show URLs
SELECT id, \"shortCode\", \"originalUrl\", \"clickCount\", \"isActive\", \"deletedAt\" FROM urls LIMIT 3;
"
echo ""

echo "================================"
echo "✅ VERIFICATION COMPLETE"
echo "================================"