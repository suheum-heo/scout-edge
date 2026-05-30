# Static map of FotMob player IDs to canonical names.
# Expand as needed. IDs sourced from fotmob.com player URLs.
# Format: fotmob_id: "Canonical Name"

PLAYER_IDS: dict[int, str] = {
    # Goalkeepers
    697140: "Mike Maignan",
    560679: "Andre Onana",
    484917: "Ederson",
    611556: "Alisson",
    319371: "Manuel Neuer",

    # Defenders
    839956: "Erling Haaland",   # placeholder — swap for real CB targets
    758759: "Josko Gvardiol",
    898528: "Leny Yoro",
    862093: "Dean Huijsen",
    894858: "Lutsharel Geertruida",
    733669: "Castello Lukeba",
    764830: "Willian Pacho",

    # Midfielders
    866141: "Martin Odegaard",
    744382: "Declan Rice",
    892473: "Manu Kone",
    897948: "Joao Neves",
    874693: "Gabri Veiga",
    848980: "Youssouf Fofana",
    900000: "Kobbie Mainoo",

    # Attackers
    961995: "Bukayo Saka",
    935973: "Lamine Yamal",
    956108: "Florian Wirtz",
    869483: "Khvicha Kvaratskhelia",
    870985: "Rafael Leao",
    902636: "Evan Ferguson",
    894397: "Mathys Tel",
}
