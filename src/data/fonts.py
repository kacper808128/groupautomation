"""
Common system fonts database for font fingerprint spoofing.
These are real font lists from Windows 10/11 systems.
"""

# Windows 10/11 default fonts (always present)
WINDOWS_DEFAULT_FONTS = [
    "Arial",
    "Arial Black",
    "Bahnschrift",
    "Calibri",
    "Cambria",
    "Cambria Math",
    "Candara",
    "Comic Sans MS",
    "Consolas",
    "Constantia",
    "Corbel",
    "Courier New",
    "Ebrima",
    "Franklin Gothic Medium",
    "Gabriola",
    "Gadugi",
    "Georgia",
    "HoloLens MDL2 Assets",
    "Impact",
    "Ink Free",
    "Javanese Text",
    "Leelawadee UI",
    "Lucida Console",
    "Lucida Sans Unicode",
    "Malgun Gothic",
    "Marlett",
    "Microsoft Himalaya",
    "Microsoft JhengHei",
    "Microsoft New Tai Lue",
    "Microsoft PhagsPa",
    "Microsoft Sans Serif",
    "Microsoft Tai Le",
    "Microsoft YaHei",
    "Microsoft Yi Baiti",
    "MingLiU-ExtB",
    "Mongolian Baiti",
    "MS Gothic",
    "MS PGothic",
    "MS UI Gothic",
    "MV Boli",
    "Myanmar Text",
    "Nirmala UI",
    "Palatino Linotype",
    "Segoe MDL2 Assets",
    "Segoe Print",
    "Segoe Script",
    "Segoe UI",
    "Segoe UI Emoji",
    "Segoe UI Historic",
    "Segoe UI Symbol",
    "SimSun",
    "Sitka Banner",
    "Sitka Display",
    "Sitka Heading",
    "Sitka Small",
    "Sitka Subheading",
    "Sitka Text",
    "Sylfaen",
    "Symbol",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana",
    "Webdings",
    "Wingdings",
    "Yu Gothic",
]

# Common additionally installed fonts
COMMON_INSTALLED_FONTS = [
    # Microsoft Office fonts
    "Book Antiqua",
    "Bookman Old Style",
    "Century",
    "Century Gothic",
    "Century Schoolbook",
    "Garamond",
    "Haettenschweiler",
    "Monotype Corsiva",
    "MS Reference Sans Serif",
    "MS Reference Specialty",
    "Rockwell",
    "Rockwell Condensed",
    "Rockwell Extra Bold",

    # Adobe fonts
    "Adobe Arabic",
    "Adobe Devanagari",
    "Adobe Fan Heiti Std",
    "Adobe Fangsong Std",
    "Adobe Garamond Pro",
    "Adobe Gothic Std",
    "Adobe Hebrew",
    "Adobe Heiti Std",
    "Adobe Kaiti Std",
    "Adobe Ming Std",
    "Adobe Myungjo Std",
    "Adobe Song Std",
    "Kozuka Gothic Pr6N",
    "Kozuka Mincho Pr6N",
    "Myriad Pro",
    "Source Code Pro",
    "Source Sans Pro",

    # Google fonts (commonly installed)
    "Open Sans",
    "Roboto",
    "Lato",
    "Montserrat",
    "Oswald",
    "Raleway",
    "PT Sans",
    "Poppins",
    "Ubuntu",
    "Nunito",
]

# Font profiles (predefined combinations)
FONT_PROFILES = [
    # Profile 1: Clean Windows 10/11 install
    {
        "name": "windows_clean",
        "fonts": WINDOWS_DEFAULT_FONTS,
    },
    # Profile 2: Windows with Office
    {
        "name": "windows_office",
        "fonts": WINDOWS_DEFAULT_FONTS + [
            "Book Antiqua",
            "Bookman Old Style",
            "Century",
            "Century Gothic",
            "Garamond",
            "Monotype Corsiva",
        ],
    },
    # Profile 3: Windows with Adobe products
    {
        "name": "windows_adobe",
        "fonts": WINDOWS_DEFAULT_FONTS + [
            "Adobe Garamond Pro",
            "Myriad Pro",
            "Source Code Pro",
            "Source Sans Pro",
        ],
    },
    # Profile 4: Windows with Google Fonts
    {
        "name": "windows_google_fonts",
        "fonts": WINDOWS_DEFAULT_FONTS + [
            "Open Sans",
            "Roboto",
            "Lato",
            "Montserrat",
        ],
    },
    # Profile 5: Full installation (power user)
    {
        "name": "windows_full",
        "fonts": WINDOWS_DEFAULT_FONTS + COMMON_INSTALLED_FONTS[:15],
    },
]
