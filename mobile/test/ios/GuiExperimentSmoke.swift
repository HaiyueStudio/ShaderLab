import XCTest

// Physical taps hit the Engine GUI canvas. The opt-in test snapshot exposes
// drawn bounds/state only; it never invokes commands or runs during sampling.
final class GuiExperimentSmoke: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "studio.haiyue.shaderlab")
    var shell: XCUIElement { app.descendants(matching: .any).matching(identifier: "gui-shell").firstMatch }
    func state() -> [String:Any] {
        guard let text = shell.value as? String, let data = text.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String:Any] else { return [:] }
        return value
    }
    func wait(_ key: String, _ value: String, timeout: Double = 20) {
        let condition = NSPredicate { _,_ in String(describing: self.state()[key] ?? "missing") == value }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate:condition,object:nil)], timeout:timeout), .completed, "\(key)=\(value): \(state())\n\(app.debugDescription)")
    }
    func tap(_ id: String, option: Int? = nil) {
        guard let targets = state()["targets"] as? [String:[String:Double]], let rect=targets[id] else { XCTFail("Missing \(id): \(state())"); return }
        let y = option == nil ? rect["y"]! + rect["height"]!/2 : rect["y"]! + rect["height"]! + 4 + Double(option!)*28 + 14
        // XCTest may report a transformed UIView frame during system transitions.
        // Use the canvas logical viewport rather than treating its points as screen points.
        let viewport=targets.values.filter { $0["x"] == 0 && $0["y"] == 0 }.max { $0["width"]! * $0["height"]! < $1["width"]! * $1["height"]! }!
        shell.coordinate(withNormalizedOffset:CGVector(dx:(rect["x"]!+rect["width"]!/2)/viewport["width"]!,dy:y/viewport["height"]!)).tap()
    }
    func capture(_ name:String) { let a=XCTAttachment(screenshot:XCUIScreen.main.screenshot());a.name=name;a.lifetime = .keepAlways;add(a) }
    func testGuiEditor() {
        continueAfterFailure=false
        let orientation=XCUIDevice.shared.orientation
        defer { XCUIDevice.shared.orientation=orientation }
        XCUIDevice.shared.orientation = .portrait
        app.launchArguments=["--shaderlab-ui=gui","--shaderlab-gui-ui-check"]
        app.launch()
        XCTAssertTrue(shell.waitForExistence(timeout:30),app.debugDescription)
        wait("gallery","1");capture("gui-gallery")
        tap("gui-new");wait("gallery","0");wait("compile","ready");capture("gui-editor")
        for (index,value) in [(1,"0.75"),(2,"0.5"),(3,"0.25"),(0,"1"),(1,"0.75")] {
            tap("gui-scale");tap("gui-scale",option:index);wait("scale",value);wait("compile","ready")
        }
        tap("gui-play");wait("playing","0");tap("gui-play");wait("playing","1")
        tap("gui-settings");wait("dialog","1");tap("gui-dialog-scale");tap("gui-dialog-scale",option:2);wait("scale","0.5");capture("gui-settings")
        XCUIDevice.shared.orientation = .landscapeLeft
        // Wait for rotation layout, then restore the modal across background.
        sleep(2);capture("gui-landscape")
        XCUIDevice.shared.press(.home);app.activate();wait("dialog","1")
        tap("gui-dialog-confirm");wait("dialog","0")
        tap("gui-settings");wait("dialog","1");tap("gui-dialog-confirm");wait("dialog","0")
        XCUIDevice.shared.orientation = .portrait;sleep(2)
        tap("gui-code-tab");wait("pane","code")
        let editor=app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout:5),app.debugDescription)
        let original=editor.value as! String;editor.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout:5))
        let space=app.keyboards.keys.matching(NSPredicate(format:"identifier == %@ OR label == %@","space"," ")).firstMatch
        XCTAssertTrue(space.waitForExistence(timeout:5));space.tap()
        tap("gui-keyboard");XCTAssertFalse(app.keyboards.firstMatch.exists)
        let edited=editor.value as! String;XCTAssertNotEqual(edited,original)
        tap("gui-save");wait("saved","作品已保存")
        tap("gui-home");wait("gallery","1");tap("gui-work-0");wait("compile","ready")
        tap("gui-code-tab");wait("pane","code");XCTAssertEqual(editor.value as? String,edited)
        capture("gui-saved-reopened");tap("gui-preview-tab");wait("pane","preview")
    }
}
