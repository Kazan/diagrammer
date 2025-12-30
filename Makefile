ADB ?= adb
APP_ID ?= com.example.diagrammerapp
SDKMANAGER ?= sdkmanager
AVDMANAGER ?= avdmanager

# Read device ID from .adb_device file if it exists and is not empty
ADB_DEVICE_FILE := .adb_device
ADB_DEVICE_ID := $(shell cat $(ADB_DEVICE_FILE) 2>/dev/null | tr -d '[:space:]')
ADB_DEVICE_FLAG := $(if $(ADB_DEVICE_ID),-s $(ADB_DEVICE_ID),)

# Helper to check device configuration
define check_device
	@if [ -z "$(ADB_DEVICE_ID)" ]; then \
		echo ""; \
		echo "⚠️  No device configured. Contents of .adb_device.dist:"; \
		echo ""; \
		cat .adb_device.dist; \
		echo ""; \
		exit 1; \
	fi
endef

.PHONY: e2e-load-scene
WEB_DIR := web
WEB_PORT ?= 5173
AVD_NAME ?= tablet_eink_android_36
AVD_PACKAGE ?= "system-images;android-36;google_apis_playstore;arm64-v8a"
AVD_DEVICE ?= pixel_tablet

.PHONY: web run apk deps ci start-emulator stop-emulator create-emulator destroy-emulator recreate-emulator deploy debug

deps:
	cd $(WEB_DIR) && npm ci

web:
	$(MAKE) deps
	cd $(WEB_DIR) && (npm run dev -- --host --port $(WEB_PORT) --strictPort & \
	DEV_PID=$$!; sleep 2; open "http://localhost:$(WEB_PORT)/assets/web/"; \
	wait $$DEV_PID)

# Local emulator development (uses AVD_NAME emulator)
run:
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	$(ADB) -s emulator-5554 wait-for-device
	$(ADB) -s emulator-5554 uninstall $(APP_ID) || true
	ANDROID_SERIAL=emulator-5554 ./gradlew installDebug
	$(ADB) -s emulator-5554 shell am start -S -W -n $(APP_ID)/.MainActivity

# Deploy debug build to configured device
debug:
	$(call check_device)
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build -- --mode development
	$(ADB) $(ADB_DEVICE_FLAG) wait-for-device
	$(ADB) $(ADB_DEVICE_FLAG) uninstall $(APP_ID) || true
	ANDROID_SERIAL=$(ADB_DEVICE_ID) ./gradlew installDebug
	$(ADB) $(ADB_DEVICE_FLAG) shell am start -S -W -n $(APP_ID)/.MainActivity

# Deploy production build to configured device
deploy:
	$(call check_device)
	$(MAKE) deps
	cd $(WEB_DIR) && npm run build
	$(ADB) $(ADB_DEVICE_FLAG) wait-for-device
	$(ADB) $(ADB_DEVICE_FLAG) uninstall $(APP_ID) || true
	ANDROID_SERIAL=$(ADB_DEVICE_ID) ./gradlew installRelease
	$(ADB) $(ADB_DEVICE_FLAG) shell am start -S -W -n $(APP_ID)/.MainActivity

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
	$(call check_device)
	@$(ADB) $(ADB_DEVICE_FLAG) logcat -s DiagrammerWebView NativeBridge
