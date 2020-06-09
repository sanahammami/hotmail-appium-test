import HotmailLoginPage from "../pages/hotmail-login.page";
import { expect } from "chai";
/* This is the entry point of the project*/
describe("Authentication test cases", function () {
  const hotmailLoginPage: HotmailLoginPage = new HotmailLoginPage();
  /* Test case to launch the authentication form*/
  it("should move home to forms", function () {
    hotmailLoginPage.goToHotmailForms();
    expect(hotmailLoginPage.hotmailLoginText).to.true;
  });
  /* Test case to fill the authentication form*/
  it("fill the form", function () {
    hotmailLoginPage.FillTheForms();
  });
});
