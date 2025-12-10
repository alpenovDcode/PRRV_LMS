# Production Management Makefile

.PHONY: up down restart logs ps backup shell-app shell-db

# Start services
up:
	docker compose -f docker-compose.prod.yml up -d

# Stop services
down:
	docker compose -f docker-compose.prod.yml down

# Restart services
restart:
	docker compose -f docker-compose.prod.yml restart

# View logs
logs:
	docker compose -f docker-compose.prod.yml logs -f

# Check status
ps:
	docker compose -f docker-compose.prod.yml ps

# Backup database
backup:
	@echo "Creating backup..."
	@mkdir -p backups
	@docker exec -t proryv_postgres pg_dumpall -c -U proryv > backups/backup_$$(date +%Y-%m-%d_%H-%M-%S).sql
	@echo "Backup created in ./backups/"

# Shell access to App
shell-app:
	docker exec -it proryv_app sh

# Shell access to Database
shell-db:
	docker exec -it proryv_postgres psql -U proryv -d proryv_lms

# Run database migrations
migrate:
	docker exec proryv_app npx prisma@5.7.1 migrate deploy
