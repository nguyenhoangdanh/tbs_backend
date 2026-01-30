#!/bin/bash
echo "Testing API endpoint..."
curl -s http://localhost:3001/api/healthcare/inventory/current-stock | jq '.groups[0] | {category, itemsCount: (.items | length), subtotal}'
