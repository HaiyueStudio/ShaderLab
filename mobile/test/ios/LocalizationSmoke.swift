import XCTest

final class LocalizationSmoke: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "studio.haiyue.shaderlab")

    func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    func selectLanguage(_ name: String) {
        let gear = app.buttons["app-settings"]
        XCTAssertTrue(gear.waitForExistence(timeout: 15), app.debugDescription)
        gear.tap()
        let selector = app.buttons["settings-locale"]
        XCTAssertTrue(selector.waitForExistence(timeout: 10), app.debugDescription)
        selector.tap()
        let option = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", name, "settings-locale")).firstMatch
        XCTAssertTrue(option.waitForExistence(timeout: 5), app.debugDescription)
        option.tap()
        capture("settings-" + name)
        app.buttons["hy-overlay-close"].tap()
        XCTAssertEqual(gear.label, ["中文": "设置", "English": "Settings", "日本語": "設定"][name])
    }

    func back() {
        app.navigationBars.buttons.firstMatch.tap()
    }

    func testThreeLanguagesAndRetainedEditor() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app.launchArguments = []
        app.launch()
        XCTAssertTrue(app.buttons["app-settings"].waitForExistence(timeout: 25), app.debugDescription)
        let originalLanguage = ["设置": "中文", "Settings": "English", "設定": "日本語"][app.buttons["app-settings"].label] ?? "中文"

        selectLanguage("日本語")
        XCTAssertEqual(app.buttons["gallery-practice"].label, "練習場")
        XCTAssertEqual(app.buttons["gallery-tutorial"].label, "チュートリアル")
        capture("japanese-gallery-portrait")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["app-settings"].waitForExistence(timeout: 25))
        XCTAssertEqual(app.buttons["app-settings"].label, "設定", "Language must survive a normal relaunch")

        app.buttons["gallery-tutorial"].tap()
        XCTAssertTrue(app.staticTexts["ひとつの画素から、ひとつの作品へ"].waitForExistence(timeout: 10), app.debugDescription)
        capture("japanese-tutorial-index")
        app.buttons["tutorial-continue"].tap()
        XCTAssertTrue(app.staticTexts["本文の言語：簡体字中国語"].waitForExistence(timeout: 10), app.debugDescription)
        capture("japanese-tutorial-original-article")
        back(); back()

        app.buttons["gallery-practice"].tap()
        XCTAssertTrue(app.staticTexts["コードで答えを描こう"].waitForExistence(timeout: 10), app.debugDescription)
        capture("japanese-practice-index")
        app.buttons["practice-continue"].tap()
        XCTAssertTrue(app.buttons["判定ルール"].waitForExistence(timeout: 15), app.debugDescription)
        capture("japanese-practice-challenge")
        back(); back()

        app.buttons["gallery-new"].tap()
        let editor = app.textViews["shader-code"]
        if !editor.waitForExistence(timeout: 5) && app.buttons["コード"].exists { app.buttons["コード"].tap() }
        XCTAssertTrue(editor.waitForExistence(timeout: 15), app.debugDescription)
        let code = editor.value as? String
        let name = app.textFields.firstMatch.value as? String
        XCTAssertTrue(code?.contains("mainImage") == true)
        capture("japanese-editor-portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("japanese-editor-landscape")

        selectLanguage("English")
        XCTAssertEqual(app.buttons["app-settings"].label, "Settings")
        XCTAssertEqual(app.buttons["editor-detect-language"].label, "Detect language on paste")
        XCTAssertEqual(editor.value as? String, code)
        XCTAssertEqual(app.textFields.firstMatch.value as? String, name)
        capture("english-editor")

        selectLanguage("中文")
        XCTAssertEqual(app.buttons["app-settings"].label, "设置")
        XCTAssertEqual(app.buttons["editor-detect-language"].label, "粘贴时自动识别语言")
        XCTAssertEqual(editor.value as? String, code)
        XCTAssertEqual(app.textFields.firstMatch.value as? String, name)
        capture("chinese-editor")
        app.buttons["editor-back"].tap()
        XCTAssertTrue(app.buttons["gallery-new"].waitForExistence(timeout: 10))
        selectLanguage(originalLanguage)
        XCUIDevice.shared.orientation = .portrait
    }
}
