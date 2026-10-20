import XCTest

// Run against the installed app with a standalone iOS UI-test target.
// Opening any secondary page regresses if Android-only navigation properties
// are accessed on iOS, even though the Gallery can still launch successfully.
final class NavigationSmoke: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "studio.haiyue.shaderlab")

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
        XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 20))
    }

    func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    func back() {
        let button = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 5), app.debugDescription)
        button.tap()
    }

    func checkEditor(_ name: String) {
        XCTAssertTrue(app.buttons["保存"].waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertFalse(app.alerts.firstMatch.exists, app.debugDescription)
        app.buttons["代码"].tap()
        XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(app.textViews.firstMatch.frame.width, 240, "Code pane must fill its column instead of collapsing to a few points")
        XCTAssertTrue(app.buttons["Image"].isHittable, "Pass tabs must not be covered by the code toolbar")
        app.buttons["预览"].tap()
        XCTAssertTrue(app.buttons["暂停"].isHittable, "Playback controls must not be covered by the preview options")
        capture(name)
        back()
        XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 5))
    }

    func testNewAndExampleNavigation() {
        app.buttons["＋ 新建"].tap()
        checkEditor("new-editor")
        let example = app.buttons["example-aurora"]
        XCTAssertTrue(example.waitForExistence(timeout: 5))
        if !example.isHittable { app.swipeUp() }
        example.tap()
        checkEditor("example-editor")
    }

    func testGalleryCardsHaveSeparatePositions() {
        let cards = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "example-"))
        XCTAssertEqual(cards.count, 8, app.debugDescription)
        XCTAssertFalse(app.buttons["打开 ↗"].exists, "Cards should open directly without a separate button")
        let positions = cards.allElementsBoundByIndex.map { "\($0.frame.origin.x),\($0.frame.origin.y)" }
        capture("gallery-eight-examples")
        XCTAssertEqual(Set(positions).count, 8, "Every example must occupy its own grid cell")
    }

    func testAllEightExamplesRender() {
        let samples = [
            ("aurora", "Aurora ribbons"), ("marble", "Liquid chrome"),
            ("tunnel", "Neon passage"), ("feedback", "Afterglow"),
            ("keyboard", "Key light"), ("puzzle", "Sliding city"),
            ("minesweeper", "Minefield"), ("clock", "Local time · 时钟")
        ]
        let presented = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "原生 WebGPU 已呈现 ")).firstMatch
        let success = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "编译成功 · ")).firstMatch
        for (id, name) in samples {
            let open = app.buttons["example-" + id]
            XCTAssertTrue(open.exists, "Missing example: " + name)
            for _ in 0..<12 {
                if open.isHittable { break }
                app.swipeUp()
            }
            XCTAssertTrue(open.isHittable, "Unreachable example: " + name)
            open.tap()
            XCTAssertTrue(app.navigationBars[name].waitForExistence(timeout: 10), app.debugDescription)
            // The host replaces the initial compile status when the first GPU
            // frame is presented. Check that frame, then explicitly recompile.
            XCTAssertTrue(presented.waitForExistence(timeout: 30), app.debugDescription)
            app.buttons["运行"].firstMatch.tap()
            XCTAssertTrue(success.waitForExistence(timeout: 15), app.debugDescription)
            XCTAssertFalse(app.alerts.firstMatch.exists, app.debugDescription)
            XCTAssertTrue(app.buttons["暂停"].isHittable, app.debugDescription)
            capture("example-" + id)
            back()
            XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 5))
        }
    }

    func testPreviewResolutionChoices() {
        app.buttons["＋ 新建"].tap()
        XCTAssertTrue(app.buttons["保存"].waitForExistence(timeout: 15), app.debugDescription)
        app.buttons["预览"].tap()
        XCTAssertTrue(app.buttons["暂停"].waitForExistence(timeout: 20), app.debugDescription)
        let success = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "编译成功 · ")).firstMatch
        for scale in ["75%", "50%", "25%", "100%", "75%"] {
            app.buttons["分辨率"].tap()
            XCTAssertTrue(app.buttons[scale].waitForExistence(timeout: 5), app.debugDescription)
            app.buttons[scale].tap()
            XCTAssertTrue(success.waitForExistence(timeout: 15), app.debugDescription)
            XCTAssertFalse(app.staticTexts["编译失败，请查看代码区诊断"].exists, app.debugDescription)
            XCTAssertTrue(app.buttons["暂停"].isHittable, "Changing resolution must keep the preview visible")
            if scale == "75%" { capture("preview-75-percent") }
        }
        back()
        XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 5))
    }

    func testTutorialNavigation() {
        app.buttons["教程"].tap()
        let chapter = app.buttons["片元、像素与第一个颜色"]
        XCTAssertTrue(chapter.waitForExistence(timeout: 10), app.debugDescription)
        chapter.tap()
        XCTAssertTrue(app.staticTexts["理解 mainImage 如何把一个像素坐标映射到颜色。"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.alerts.firstMatch.exists)
        capture("tutorial-chapter")
        back()
        XCTAssertTrue(chapter.waitForExistence(timeout: 5))
        back()
        XCTAssertTrue(app.buttons["＋ 新建"].waitForExistence(timeout: 5))
    }
}
