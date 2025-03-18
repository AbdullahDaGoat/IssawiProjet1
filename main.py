from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# Set up mobile emulation
mobile_emulation = {
    "deviceMetrics": {"width": 375, "height": 812, "pixelRatio": 3.0},
    "userAgent": "Instagram 272.0.0.0.17 Android (30/11; 320dpi; 720x1600; Pixel 5; walleye; google; en_US)"
}

chrome_options = Options()
chrome_options.add_experimental_option("mobileEmulation", mobile_emulation)

# Add headers that mimic the Instagram app
chrome_options.add_argument("user-agent=Instagram 272.0.0.0.17 Android")
chrome_options.add_argument("--disable-blink-features=AutomationControlled")

# Launch browser
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

# Open Instagram
driver.get("https://www.instagram.com")

# Keep the browser open
input("Press Enter to close...")
driver.quit()
