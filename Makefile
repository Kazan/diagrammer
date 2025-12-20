WEB_DIR := web
WEB_PORT ?= 5173
AVD ?= Pixel_Tablet_API_34

.PHONY: web apkdev apk deps ci

deps:
	cd $(WEB_DIR) && npm ci

web:
	$(MAKE) deps
	cd $(WEB_DIR) && (npm run dev -- --host --port $(WEB_PORT) --strictPort & \
	DEV_PID=$$!; sleep 2; open "http://localhost:$(WEB_PORT)/assets/web/"; \
	wait $$DEV_PID)

apkdev:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	@echo "Starting emulator $(AVD) if not running..."
	@pgrep -f "emulator.*-avd $(AVD)" >/dev/null || (emulator -avd $(AVD) -netdelay none -netspeed full >/dev/null 2>&1 & sleep 12)
	adb wait-for-device
	./gradlew installDebug

apk:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build
	./gradlew assembleRelease

ci:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	./gradlew assembleDebug
