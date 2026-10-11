"""CS2 weapons: display names (demos) → GSI names and types, magazine sizes.

Demos name weapons like the HUD ("AK-47", "Smoke Grenade"), GSI like the game files ("weapon_ak47", type
"Rifle"). The director works with the GSI form, so demo data is translated with this table.
"""

# display name → (GSI name, GSI type, magazine size)
WEAPONS = {
    "Glock-18": ("weapon_glock", "Pistol", 20), "USP-S": ("weapon_usp_silencer", "Pistol", 12),
    "P2000": ("weapon_hkp2000", "Pistol", 13), "P250": ("weapon_p250", "Pistol", 13),
    "Five-SeveN": ("weapon_fiveseven", "Pistol", 20), "Tec-9": ("weapon_tec9", "Pistol", 18),
    "CZ75-Auto": ("weapon_cz75a", "Pistol", 12), "Desert Eagle": ("weapon_deagle", "Pistol", 7),
    "R8 Revolver": ("weapon_revolver", "Pistol", 8), "Dual Berettas": ("weapon_elite", "Pistol", 30),
    "MAC-10": ("weapon_mac10", "Submachine Gun", 30), "MP9": ("weapon_mp9", "Submachine Gun", 30),
    "MP7": ("weapon_mp7", "Submachine Gun", 30), "MP5-SD": ("weapon_mp5sd", "Submachine Gun", 30),
    "UMP-45": ("weapon_ump45", "Submachine Gun", 25), "P90": ("weapon_p90", "Submachine Gun", 50),
    "PP-Bizon": ("weapon_bizon", "Submachine Gun", 64),
    "Galil AR": ("weapon_galilar", "Rifle", 35), "FAMAS": ("weapon_famas", "Rifle", 25),
    "AK-47": ("weapon_ak47", "Rifle", 30), "M4A4": ("weapon_m4a1", "Rifle", 30),
    "M4A1-S": ("weapon_m4a1_silencer", "Rifle", 20), "SG 553": ("weapon_sg556", "Rifle", 30),
    "AUG": ("weapon_aug", "Rifle", 30),
    "SSG 08": ("weapon_ssg08", "SniperRifle", 10), "AWP": ("weapon_awp", "SniperRifle", 5),
    "G3SG1": ("weapon_g3sg1", "SniperRifle", 20), "SCAR-20": ("weapon_scar20", "SniperRifle", 20),
    "Nova": ("weapon_nova", "Shotgun", 8), "XM1014": ("weapon_xm1014", "Shotgun", 7),
    "Sawed-Off": ("weapon_sawedoff", "Shotgun", 7), "MAG-7": ("weapon_mag7", "Shotgun", 5),
    "M249": ("weapon_m249", "Machine Gun", 100), "Negev": ("weapon_negev", "Machine Gun", 150),
    "Smoke Grenade": ("weapon_smokegrenade", "Grenade", -1), "Flashbang": ("weapon_flashbang", "Grenade", -1),
    "High Explosive Grenade": ("weapon_hegrenade", "Grenade", -1), "Molotov": ("weapon_molotov", "Grenade", -1),
    "Incendiary Grenade": ("weapon_incgrenade", "Grenade", -1), "Decoy Grenade": ("weapon_decoy", "Grenade", -1),
    "C4 Explosive": ("weapon_c4", "C4", -1), "Zeus x27": ("weapon_taser", "Taser", 1),
}
BY_GSI = {gsi: (display, kind, clip) for display, (gsi, kind, clip) in WEAPONS.items()}
# grenade weapon (weapon_fire) → GSI grenade type in "allgrenades"
THROWN = {"weapon_smokegrenade": "smoke", "weapon_flashbang": "flashbang", "weapon_hegrenade": "frag",
          "weapon_molotov": "firebomb", "weapon_incgrenade": "firebomb", "weapon_decoy": "decoy"}


def from_display(name) -> tuple[str, str, int]:
    """GSI name, type and magazine size for a weapon as demos name it (knives and unknowns: Knife)."""
    if not isinstance(name, str) or not name:
        return "", "", -1
    if name in WEAPONS:
        return WEAPONS[name]
    return "weapon_knife", "Knife", -1


def from_event(name) -> str:
    """GSI name for a weapon as game events name it ("ak47" or "weapon_ak47")."""
    if not isinstance(name, str) or not name:
        return ""
    return name if name.startswith("weapon_") else "weapon_" + name
