WEB_DIR := web
WEB_PORT ?= 5173
AVD ?= Pixel_Tablet_API_34

.PHONY: web run apk deps ci start-emulator

deps:
	cd $(WEB_DIR) && npm ci

web:
	$(MAKE) deps
	cd $(WEB_DIR) && (npm run dev -- --host --port $(WEB_PORT) --strictPort & \
	DEV_PID=$$!; sleep 2; open "http://localhost:$(WEB_PORT)/assets/web/"; \
	wait $$DEV_PID)

run: emu
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	adb wait-for-device
	./gradlew installDebug

apk:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build
	./gradlew assembleRelease

emu:
	@echo "Starting emulator $(AVD) if not running..."
	@emulator -avd tablet_eink_android_36 &

ci:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	./gradlew assembleDebug
