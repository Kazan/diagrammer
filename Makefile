ADB ?= adb
APP_ID ?= com.example.diagrammerapp
SDKMANAGER ?= sdkmanager
AVDMANAGER ?= avdmanager

.PHONY: e2e-load-scene
start:
	$(ADB) shell am force-stop $(APP_ID)
	$(ADB) shell pm clear $(APP_ID)
	$(ADB) shell am start -S -W -n $(APP_ID)/.MainActivity
WEB_DIR := web
WEB_PORT ?= 5173
AVD_NAME ?= tablet_eink_android_36
AVD_PACKAGE ?= "system-images;android-36;google_apis_playstore;arm64-v8a"
AVD_DEVICE ?= pixel_tablet

.PHONY: web run apk deps ci start-emulator stop-emulator create-emulator destroy-emulator recreate-emulator

deps:
	cd $(WEB_DIR) && npm ci

web:
	$(MAKE) deps
	cd $(WEB_DIR) && (npm run dev -- --host --port $(WEB_PORT) --strictPort & \
	DEV_PID=$$!; sleep 2; open "http://localhost:$(WEB_PORT)/assets/web/"; \
	wait $$DEV_PID)

run: install start

install:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	adb wait-for-device
	./gradlew installDebug

apk:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build
	./gradlew assembleRelease

emu:
	@echo "Starting emulator $(AVD_NAME) if not running..."
	@emulator -avd $(AVD_NAME) &

stop-emulator:
	$(ADB) emu kill

create-emulator:
	$(SDKMANAGER) --install $(AVD_PACKAGE)
	$(AVDMANAGER) create avd -n $(AVD_NAME) -k $(AVD_PACKAGE) -d $(AVD_DEVICE) --force

destroy-emulator:
	$(AVDMANAGER) delete avd -n $(AVD_NAME) || true

recreate-emulator: destroy-emulator create-emulator

ci:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	./gradlew assembleDebug

logs:
	@adb logcat -s DiagrammerWebView NativeBridge
