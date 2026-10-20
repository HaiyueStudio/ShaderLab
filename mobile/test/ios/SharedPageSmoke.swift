import XCTest

// Run with a standalone UI-test target against the installed G07 package.
final class SharedPageSmoke: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "studio.haiyue.shaderlab")
    func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testSharedEditor() {
        continueAfterFailure = false
        let originalOrientation = XCUIDevice.shared.orientation
        defer { XCUIDevice.shared.orientation = originalOrientation }
        app.launch()
        XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 20), app.debugDescription)
        capture("shared-gallery")
        app.buttons["＋ 新建"].tap()
        let save = app.buttons["/shader-project/actions/save"]
        let scale = app.buttons["/shader-toolbar/controls/scale"]
        XCTAssertTrue(save.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(scale.waitForExistence(timeout: 20), app.debugDescription)
        let success = app.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@", "编译成功 · ")).firstMatch
        for value in ["75%", "50%", "25%", "100%", "75%"] {
            if !scale.isHittable { app.scrollViews.firstMatch.swipeLeft() }
            scale.tap()
            let choice = app.buttons[value].firstMatch
            XCTAssertTrue(choice.waitForExistence(timeout: 5), app.debugDescription); if value == "50%" { capture("shared-select-menu") }; choice.tap()
            XCTAssertTrue(success.waitForExistence(timeout: 20), app.debugDescription)
            XCTAssertTrue(app.buttons["/shader-toolbar/controls/play"].exists)
        }
        capture("shared-preview-75")
        let play = app.buttons["/shader-toolbar/controls/play"]
        play.tap(); XCTAssertEqual(play.label, "播放"); play.tap(); XCTAssertEqual(play.label, "暂停")
        let settings = app.buttons["/shader-project/actions/information"]
        let close = app.buttons["/shader-project/information/close"]
        settings.tap(); XCTAssertTrue(close.waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["/shader-project/information/scale-row/scale"].tap()
        let dialogChoice=app.buttons["50%"].firstMatch
        XCTAssertTrue(dialogChoice.waitForExistence(timeout:5));dialogChoice.tap()
        XCTAssertTrue(close.waitForExistence(timeout:5))
        capture("shared-settings-portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(close.waitForExistence(timeout: 5)); capture("settings-landscape")
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(close.waitForExistence(timeout: 15), app.debugDescription); close.tap()
        settings.tap(); XCTAssertTrue(close.waitForExistence(timeout: 5)); close.tap()
        XCUIDevice.shared.orientation = .portrait
        let field = app.textFields["/shader-project/name/field"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap()
        field.typeText(" G07 " + String(Int(Date().timeIntervalSince1970)))
        let done = app.buttons["完成"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 5), app.debugDescription); done.tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        app.buttons["代码"].tap()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5)); editor.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        // This TextView's AX snapshot omits hasKeyboardFocus even while UIKit
        // displays its keyboard. Tap a real key and verify actual/persisted text.
        let original = editor.value as! String
        // iPad exposes a literal blank label; iPhone exposes identifier "space".
        let space = app.keyboards.keys.matching(NSPredicate(format: "identifier == %@ OR label == %@", "space", " ")).firstMatch
        XCTAssertTrue(space.waitForExistence(timeout: 5), app.debugDescription); space.tap()
        app.buttons["收起键盘"].tap(); XCTAssertFalse(app.keyboards.firstMatch.exists)
        let edited = editor.value as! String
        XCTAssertNotEqual(edited, original)
        for _ in 0..<2 {
            app.buttons["生成代码"].tap()
            let generated = app.textViews.matching(NSPredicate(format: "value CONTAINS %@", "void mainImage")).firstMatch
            XCTAssertTrue(generated.waitForExistence(timeout: 30), app.debugDescription)
            app.buttons["关闭"].tap()
            XCTAssertEqual(editor.value as? String, edited)
        }
        save.tap()
        XCTAssertTrue(app.staticTexts["作品已保存"].waitForExistence(timeout: 10), app.debugDescription)
        let name = field.value as! String
        app.navigationBars.buttons.firstMatch.tap()
        let work = app.buttons[name].firstMatch
        for _ in 0..<20 { if work.exists && work.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(work.waitForExistence(timeout: 10), app.debugDescription); work.tap()
        XCTAssertEqual(app.textFields["/shader-project/name/field"].value as? String, name)
        app.buttons["代码"].tap()
        XCTAssertEqual(app.textViews.firstMatch.value as? String, edited)
        capture("saved-reopened")
        app.buttons["预览"].tap()
    }
}
