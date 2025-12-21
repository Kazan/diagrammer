ADB ?= adb
APP_ID ?= com.example.diagrammerapp
SCENE_URI ?= file:///sdcard/Download/sample-scene.excalidraw
SCENE_FILE ?= research/sample-scene.excalidraw

.PHONY: e2e-load-scene
e2e-load-scene:
	$(ADB) shell am force-stop $(APP_ID)
	$(ADB) shell pm clear $(APP_ID)
	$(ADB) push $(SCENE_FILE) /sdcard/Download/sample-scene.excalidraw
	$(ADB) shell am start -S -W -n $(APP_ID)/.MainActivity --es LOAD_SCENE_URI $(SCENE_URI)
	$(ADB) shell am start -S -W -n $(APP_ID)/.MainActivity --es LOAD_SCENE_URI $(SCENE_URI)
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
