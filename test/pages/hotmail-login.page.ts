import * as loginSelector from "./selectors/login-selector";
import * as loginData from "./data/login-data";
class HotmailLoginPage {
  private get hotmailOption(): WebdriverIO.Element {
    return $(loginSelector.hotmailOption);
  }
  private get inputLogin(): WebdriverIO.Element {
    return $(loginSelector.inputLogin);
  }
  /* This function is to localise the belowing elements*/
  private get inputPassword(): WebdriverIO.Element {
    return $(loginSelector.inputPassword);
  }
  private get submitButton(): WebdriverIO.Element {
    return $(loginSelector.submitButton);
  }

  private get loginPageText(): WebdriverIO.Element {
    return $(loginSelector.loginPageText);
  }
  /* This function allows to select Hotmail option from the choice list*/
  public goToHotmailForms() {
    this.hotmailOption.click();
  }
  /* This function permits to fill the form fields*/
  public FillTheForms() {
    this.inputLogin.waitForDisplayed(20000);
    this.inputLogin.addValue(loginData.login);
    this.inputPassword.waitForDisplayed(20000);
    this.inputPassword.addValue(loginData.password);
    this.submitButton.waitForDisplayed(20000);
    this.submitButton.click;
  }
  /* This function returns a boolean variable to verify whether 
  the hotmail login text is diplayed or not*/
  public get hotmailLoginText(): boolean {
    return this.loginPageText.waitForDisplayed();
  }
}

export default HotmailLoginPage;
