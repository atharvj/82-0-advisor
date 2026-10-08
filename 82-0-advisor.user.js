// ==UserScript==
// @name         82-0 Perfect Team Coach
// @namespace    https://82-0.com/
// @version      2.7.0
// @description  Match-aware live draft optimization, positions, retries, and 82-0 guidance for Classic, Hoop IQ, and 1v1.
// @author       Intellectual07
// @license      MIT
// @match        https://82-0.com/*
// @match        https://www.82-0.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "2.7.0";
  const MODEL_VERIFIED = "2026-09-23";
  const PANEL_ID = "__82coach_host__";
  const DATASET_WAIT_MS = 15_000;
  const LIVE_ROWS_KEY = "__82coach_live_rows_v4__";
  const UI_KEY = "__82coach_ui_v1__";
  const MODE_KEY = "__82coach_mode_v1__";
  const MISMATCH_KEY = "__82coach_model_mismatch_v1__";
  const PICKS_KEY = "__82coach_picks_v1__";
  const HISTORY_KEY = "__82coach_results_v1__";
  const HISTORY_LIMIT = 100;
  const PICKS_MAX_AGE = 6 * 60 * 60 * 1000;
  const PENDING_PICK_MAX_AGE = 30_000;
  const MAX_IDLE_RECOVERY_SCANS = 8;

  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const POSITION_INDEX = Object.freeze({ PG: 0, SG: 1, SF: 2, PF: 3, C: 4 });
  const FULL_POSITION_MASK = 0b11111;
  const ERAS = new Set([
    "1960s",
    "1970s",
    "1980s",
    "1990s",
    "2000s",
    "2010s",
    "2020s",
  ]);
  // Legacy dataset-backed record curve. v4 records changed; live-mode advice
  // uses calculated scores only and final records come from the site, never
  // from this old curve or its 82-win threshold.
  const RECORD_SCORE_CAP = 110;
  const TARGET_SCORE = 109.5;
  const EPSILON = 1e-10;
  // Anonymous Classic roll samples collected 2026-10-07. Planning priors only:
  // [franchise id, era, [name, position mask, PTS, REB, AST, STL, BLK][]].
  // They never supply a selectable player or claim to reveal future rolls.
  const LIVE_PRIOR_CELLS = [
    ["347","1990s",[["Fat Lever",3,18.3,9.3,6.5,2.1,0.2],["Michael Adams",1,20.51,3.3,8.21,1.82,0.05],["Nick Van Exel",3,16.5,2.3,7.4,0.8,0.1],["Orlando Woolridge",4,25.1,6.8,2.2,1.3,0.4],["LaPhonso Ellis",12,15.19,7.87,2.14,0.84,0.92],["Antonio McDyess",24,17.16,8.23,1.3,0.94,1.77],["Dikembe Mutombo",16,12.92,12.29,1.67,0.56,3.81]]],
    ["354","2000s",[["Mike Bibby",1,15.2,3.7,8.25,1.45,0.15],["Jason Williams",1,11.91,2.37,7.18,1.31,0.1],["O.J. Mayo",2,18.5,3.8,3.2,1.1,0.2],["Michael Dickerson",2,16.7,3.26,2.8,1.15,0.44],["Shareef Abdur-Rahim",28,20.4,9.6,3.2,1.1,1.05],["Rudy Gay",12,16.65,5.41,1.67,1.17,0.87],["Pau Gasol",24,18.85,8.6,3.08,0.53,1.84]]],
    ["348","2020s",[["Cade Cunningham",3,22,5.5,7.6,1.1,0.7],["Dennis Schröder",3,13.1,2.6,5.4,0.9,0.2],["Derrick Walton Jr.",6,6.3,3.3,7,2.3,1.3],["Jerami Grant",12,20.8,4.3,2.6,0.8,1.1],["Tobias Harris",12,13.5,5.5,2.4,0.9,0.6],["Jalen Duren",16,13.6,10.3,2,0.7,0.9],["Mason Plumlee",16,10.4,9.3,3.6,0.8,0.9]]],
    ["366","1980s",[["John Lucas",3,10.9,2.9,10.7,1.5,0.1],["Johnny Moore",1,10.26,3.21,8.11,2.13,0.25],["George Gervin",6,27.73,4.57,2.84,1.09,0.75],["Alvin Robertson",2,16.16,5.37,5.39,2.9,0.52],["Larry Kenon",12,20.1,9.9,3,1.4,0.2],["Frank Brickowski",24,14.38,6.42,2.83,1.32,0.49],["Artis Gilmore",16,16.11,9.66,1.5,0.52,1.84]]],
    ["340","1960s",[["Lenny Wilkens",1,15.48,4.95,5.49,0,0],["Walt Hazzard",3,11.2,3.3,5.9,0,0],["Lou Hudson",6,18.46,5.6,1.83,0,0],["Joe Caldwell",6,15.14,4.63,2.73,0,0],["Cliff Hagan",4,18.62,6.31,3.23,0,0],["Bob Pettit",24,27.55,16.69,3.3,0,0],["Bill Bridges",8,12.6,11.99,2.73,0,0],["Clyde Lovellette",16,21.28,10,2.12,0,0]]],
    ["367","2000s",[["Mike James",1,20.3,3.3,5.8,0.9,0],["Mark Jackson",1,8.5,3.4,9.2,1.2,0.1],["Vince Carter",14,24.1,5.12,3.98,1.35,0.96],["Tracy McGrady",6,15.4,6.3,3.3,1.1,1.9],["Chris Bosh",24,19.59,9.14,2.16,0.8,1.21],["Antonio Davis",24,12.89,9.15,1.67,0.48,1.31]]],
    ["359","1990s",[["Mark Jackson",1,10.05,3.5,7.48,1.18,0.1],["Derek Harper",3,11.72,2.24,4.84,1.35,0.1],["Latrell Sprewell",6,16.4,4.2,2.5,1.2,0.1],["Larry Johnson",14,13.57,5.53,2.25,0.7,0.32],["Anthony Mason",28,9.86,7.71,2.61,0.64,0.24],["Patrick Ewing",24,24.08,11.02,2.16,0.95,2.7],["Charles Oakley",24,10.03,9.97,2.34,1.14,0.23]]],
    ["347","1980s",[["Fat Lever",3,16.79,7.31,7.74,2.54,0.32],["Michael Adams",1,16.13,3.18,6.25,2.1,0.15],["David Thompson",2,20.97,3.43,2.66,0.73,0.74],["Alex English",4,26.69,5.83,4.56,1.06,0.8],["Kiki Vandeweghe",12,23.32,5.25,2.68,0.68,0.5],["George McGinnis",8,15.6,10.3,4.9,1.5,0.4],["Dan Issel",16,20.54,7.26,2.25,0.92,0.6],["George Johnson",28,10.2,7.8,2.1,1.1,0.9]]],
    ["345","2000s",[["LeBron James",31,27.52,7.01,6.68,1.75,0.85],["Andre Miller",3,14.46,4.16,8.22,1.37,0.3],["Clarence Weatherspoon",12,11.3,9.7,1.3,1,1.3],["Shawn Kemp",24,17.8,8.8,1.7,1.2,1.2]]],
    ["360","1960s",[["Lenny Wilkens",1,22.4,6.2,8.2,0,0],["Walt Hazzard",3,24,4.2,6.2,0,0],["Rod Thorn",3,14.07,3.66,3.29,0,0],["Tom Meschery",12,14.25,10.1,2.4,0,0],["Bob Kauffman",28,7.8,5.9,1,0,0],["John Tresvant",8,13.6,10.3,2.4,0,0],["Bob Rule",16,21.05,10.5,1.45,0,0]]],
    ["352","2010s",[["Chris Paul",1,18.75,4.24,9.84,2.22,0.14],["Baron Davis",1,14.39,3.24,7.64,1.59,0.56],["Lou Williams",3,21.33,2.74,5.35,0.95,0.15],["Danilo Gallinari",14,18.74,5.79,2.46,0.68,0.35],["Tobias Harris",12,20.31,7.2,2.85,0.88,0.47],["Blake Griffin",24,21.55,9.31,4.24,0.96,0.53],["Marcus Camby",24,7.7,12.1,3,1.4,1.9]]],
    ["357","2010s",[["Ricky Rubio",1,10.34,4.26,8.48,2.1,0.11],["Jeff Teague",1,13.41,2.81,7.45,1.31,0.34],["Jimmy Butler",14,22.07,5.29,4.81,2.06,0.49],["Mo Williams",3,12.2,2.4,6.4,0.7,0.2],["Robert Covington",28,14.5,5.7,1.5,2.3,1.1],["Karl-Anthony Towns",24,22.24,11.87,2.61,0.77,1.5],["Kevin Love",24,21.5,13.13,2.86,0.74,0.45]]],
    ["347","2010s",[["Chauncey Billups",3,18.27,2.85,5.48,1.06,0.14],["Ty Lawson",1,14.25,2.89,6.61,1.21,0.1],["Andre Iguodala",14,13,5.3,5.4,1.7,0.7],["Carmelo Anthony",12,26.94,7.02,3.03,1.13,0.48],["Nikola Jokić",16,16.28,9.55,5.17,1.11,0.72],["Nenê",24,14.02,7.57,2.25,1.26,0.98]]],
    ["368","2000s",[["Deron Williams",1,16.2,2.9,8.69,1,0.25],["John Stockton",1,11.95,2.78,8.3,1.72,0.25],["Bryon Russell",6,12.06,4.65,2.03,1.29,0.3],["Matt Harpring",6,11.92,4.93,1.36,0.74,0.16],["Andrei Kirilenko",12,12.47,5.82,2.79,1.42,2.21],["Donyell Marshall",12,14.1,7.25,1.64,0.96,1.08],["Karl Malone",8,22.93,8.55,4.3,1.42,0.7],["Carlos Boozer",24,19.21,10.27,2.78,1,0.37],["Mehmet Okur",24,16,7.85,2.03,0.59,0.67]]],
    ["345","2010s",[["LeBron James",31,26.88,7.62,8.15,1.44,0.76],["Kyrie Irving",3,21.6,3.39,5.55,1.33,0.33],["Antawn Jamison",12,17.27,6.69,1.77,0.89,0.59],["Kevin Love",24,17.11,10.05,2.09,0.74,0.44]]],
    ["349","2010s",[["Stephen Curry",3,23.53,4.52,6.59,1.72,0.23],["Jarrett Jack",3,12.9,3.1,5.6,0.8,0.1],["Kevin Durant",14,25.86,7.1,5.41,0.82,1.48],["David Lee",28,16.68,9.31,2.75,0.81,0.39],["DeMarcus Cousins",16,16.3,8.2,3.6,1.3,1.5]]],
    ["343","1980s",[["Rex Chapman",3,16.9,2.5,2.3,0.9,0.3],["Muggsy Bogues",1,5.4,2.1,7.8,1.4,0.1],["Robert Reid",6,14.7,3.7,1.9,0.6,0.2],["Kelly Tripucka",4,22.6,3.8,3.2,1.2,0.2],["Kurt Rambis",8,11.1,9.4,2.1,1.3,0.8],["Earl Cureton",24,6.5,6,1.6,0.6,0.7],["Dave Hoppen",16,6.5,5,0.7,0.3,0.3]]],
    ["344","2020s",[["Josh Giddey",15,15.8,8.2,8.2,1.1,0.6],["Zach LaVine",7,24,4.8,4.4,0.8,0.3],["DeMar DeRozan",14,25.5,4.7,5.1,1,0.5],["Nikola Vučević",16,19,10.9,3.4,0.8,0.8],["Daniel Theis",16,9.6,5.5,1.7,0.6,0.9]]],
    ["349","2020s",[["Stephen Curry",3,27.4,4.9,5.7,1.1,0.4],["Chris Paul",1,9.2,3.9,6.8,1.2,0.1],["Jimmy Butler",14,18.8,5.5,5.2,1.4,0.2],["Draymond Green",12,8.2,6.7,6.6,1.2,0.9],["Kristaps Porziņģis",24,16.7,5.2,2.5,0.6,1.2],["Al Horford",16,8.3,4.9,2.6,0.7,1.1]]],
    ["346","1990s",[["Jason Kidd",3,13.66,5.87,8.76,2.05,0.31],["Derek Harper",3,16.32,2.47,5.86,1.68,0.25],["Michael Finley",6,19.52,5.06,4.14,1.31,0.37],["Sam Perkins",28,15.9,7.5,2.3,1.2,0.8],["Roy Tarpley",24,14.77,10.43,1.33,1.25,1.3],["Shawn Bradley",16,11.18,8.2,0.89,0.7,3.13]]],
    ["353","1990s",[["Magic Johnson",11,19.8,6.61,11.14,1.38,0.32],["Nick Van Exel",3,14.94,2.8,7.29,1,0.1],["Eddie Jones",6,15.26,3.79,3.04,2.04,0.66],["Cedric Ceballos",4,20.82,7.33,1.64,1.09,0.33],["Sam Perkins",28,14.57,7.96,2.03,0.91,1.04],["Shaquille O'Neal",16,27.02,11.54,2.59,0.76,2.34],["Vlade Divac",16,12.49,8.68,2.6,1.27,1.6]]],
    ["351","2020s",[["Tyrese Haliburton",3,18.7,3.8,9.7,1.5,0.6],["Malcolm Brogdon",3,20.1,5.2,5.9,0.9,0.3],["Caris LeVert",6,20.2,4.6,5.2,1.4,0.6],["Buddy Hield",6,16.2,4.7,2.8,1.1,0.3],["Domantas Sabonis",24,20.3,12,6.7,1.2,0.5],["Pascal Siakam",8,22,6.9,3.8,0.9,0.4],["Ivica Zubac",16,14.1,10.6,2.2,0.4,0.8]]],
    ["340","1980s",[["Doc Rivers",1,12.6,3.51,7.38,2.08,0.47],["Reggie Theus",3,15.8,3,4.7,1.3,0.2],["Eddie Johnson",6,16.34,2.38,5.66,1.14,0.14],["Dominique Wilkins",4,26.03,6.77,2.43,1.46,0.73],["John Drew",12,19.86,5.68,1.3,1.16,0.17],["Dan Roundfield",8,18.09,10.68,2.59,1,1.51],["Moses Malone",16,20.2,11.8,1.4,1,1.2],["Tree Rollins",16,6.7,7.42,0.67,0.54,2.78]]],
    ["357","2020s",[["D'Angelo Russell",1,18.6,3,6.4,1.1,0.3],["Patrick Beverley",3,9.2,4.1,4.6,1.2,0.9],["Anthony Edwards",2,24.6,5.2,4.1,1.3,0.6],["Kyle Anderson",12,7.3,4.1,4,1,0.7],["Jaden McDaniels",12,10.9,4.1,1.7,0.9,0.9],["Karl-Anthony Towns",24,23,9.2,4,0.8,0.9],["Julius Randle",24,19.9,6.9,4.8,0.9,0.2],["Rudy Gobert",16,12.6,11.7,1.5,0.8,1.6]]],
    ["352","2000s",[["Baron Davis",1,14.9,3.7,7.7,1.7,0.5],["Andre Miller",3,13.6,4,6.7,1.2,0.1],["Derek Anderson",7,16.9,4,3.4,1.4,0.2],["Lamar Odom",12,15.93,7.35,4.62,1.02,1.28],["Maurice Taylor",28,17.1,6.5,1.6,0.8,0.8],["Elton Brand",24,20.34,10.25,2.7,0.95,2.23],["Zach Randolph",24,20.9,9.4,2.3,0.8,0.3]]],
    ["350","1990s",[["Vernon Maxwell",3,14.92,2.94,4.32,1.39,0.24],["Kenny Smith",1,12.62,1.91,5.24,1.02,0.09],["Clyde Drexler",6,18.98,6.09,5.45,1.88,0.59],["Charles Barkley",12,16.73,12.44,4.05,1.1,0.41],["Otis Thorpe",24,15.61,9.69,2.59,0.73,0.33],["Hakeem Olajuwon",16,23.92,11.62,3.01,1.78,3.46]]],
    ["349","1970s",[["John Lucas",3,16.1,3,9.3,1.9,0.1],["Butch Beard",1,11.52,4.39,4,1.45,0.1],["Phil Smith",2,17.3,3.59,3.89,1.24,0.26],["Rick Barry",4,23.97,6.39,5.78,2.32,0.48],["Jamaal Wilkes",12,16.54,8.22,2.32,1.39,0.3],["Nate Thurmond",24,18.63,15.64,3.12,0.7,2.9],["Jerry Lucas",24,17.53,15.18,3.22,0,0]]],
    ["359","1970s",[["Walt Frazier",1,20.73,6.27,6.37,1.99,0.17],["Ray Williams",3,13.3,3.1,5.35,1.45,0.2],["Earl Monroe",3,16.99,2.82,3.71,1.12,0.31],["Dave DeBusschere",12,15.95,10.67,3.15,0.9,0.5],["Bill Bradley",4,12.74,3.08,3.4,0.66,0.2],["Bob McAdoo",24,26.65,12,3.33,1.34,1.42],["Willis Reed",24,17.39,11.68,1.92,0.6,1.1]]],
    ["341","1980s",[["Ray Williams",3,16.99,3.41,5.77,2.02,0.43],["Lester Conner",3,10.3,4.3,7.4,2.2,0.1],["Calvin Natt",12,19.7,9.7,2.1,1.5,0.4],["Orlando Woolridge",4,19.83,4.88,3.54,0.7,1.1],["Buck Williams",8,16.46,11.93,1.54,0.95,1.08],["Joe Barry Carroll",16,14.1,7.4,1.6,1.1,1.3],["Cliff Robinson",28,16.39,7.39,1.54,0.9,0.64]]],
    ["358","2020s",[["Dejounte Murray",3,17.1,6,6.9,1.8,0.3],["CJ McCollum",3,21,4.2,4.9,0.9,0.5],["Brandon Ingram",12,23,5.3,5.5,0.7,0.5],["Saddiq Bey",4,17.7,5.6,2.5,0.9,0.1],["Zion Williamson",8,24.3,6.6,4.4,1.1,0.7],["Jonas Valančiūnas",16,14.7,10.1,2.2,0.4,0.8],["Derik Queen",16,11.7,7.1,3.7,1,0.9]]],
    ["366","1990s",[["Rod Strickland",3,13.88,4.22,8.23,2,0.24],["Maurice Cheeks",1,10.9,3.3,6,1.6,0.1],["Willie Anderson",6,11.99,3.71,4.05,0.98,0.6],["Dennis Rodman",12,5.62,17.11,2.19,0.66,0.44],["Dominique Wilkins",4,18.2,6.4,1.9,0.6,0.5],["Tim Duncan",24,21.33,11.71,2.59,0.78,2.5],["David Robinson",16,24.4,11.51,2.96,1.56,3.38]]],
    ["360","2020s",[["Shai Gilgeous-Alexander",3,28.9,4.9,6.1,1.5,0.9],["Josh Giddey",15,13.8,7.4,5.8,0.8,0.5],["Zavier Simpson",6,11,5.3,7.5,1.3,1],["Isaiah Hartenstein",24,10.2,10.1,3.6,0.9,1],["Chet Holmgren",16,16.2,8.3,2,0.6,2.1]]],
    ["364","2010s",[["Damian Lillard",3,23.52,4.16,6.35,0.99,0.33],["Andre Miller",3,13.35,3.45,6.2,1.25,0.1],["Gerald Wallace",12,14.18,6.95,2.63,1.68,0.64],["Nicolas Batum",12,12.35,5.51,3.39,0.98,0.78],["LaMarcus Aldridge",24,21.45,9.21,2.24,0.87,0.97],["Jusuf Nurkić",16,14.95,9.75,2.55,0.94,1.46]]],
    ["341","2000s",[["Jason Kidd",3,14.57,7.26,9.14,1.88,0.26],["Stephon Marbury",3,23.01,3.15,8.02,1.36,0.15],["Vince Carter",14,23.61,5.75,4.72,1.16,0.52],["Keith Van Horn",12,16.99,7.79,1.93,0.8,0.59],["Kenyon Martin",24,15.11,7.59,2.35,1.27,1.39],["Brook Lopez",16,13,8.1,1,0.5,1.8]]],
    ["353","1960s",[["Jerry West",3,27.52,6.49,5.68,0,0],["Archie Clark",3,15.35,3.57,3.58,0,0],["Elgin Baylor",4,28.11,13.75,4.29,0,0],["Rudy LaRusso",12,14.14,9.59,2.09,0,0],["Mel Counts",24,11.46,8,1.42,0,0],["Wilt Chamberlain",16,20.5,21.1,4.5,0,0],["Larry Foust",16,13.3,9.3,1.6,0,0]]],
    ["349","1980s",[["Sleepy Floyd",3,17.68,3.28,6.74,1.61,0.3],["World B. Free",3,23.37,2.77,5.4,1.05,0.15],["Mitch Richmond",2,22,5.9,4.2,1,0.2],["Bernard King",4,22.54,6.36,3.55,0.95,0.35],["Chris Mullin",6,19.33,3.53,3.85,1.63,0.45],["Purvis Short",14,20.58,4.86,3,1.22,0.19],["Mickey Johnson",8,13.81,6.65,2.7,1.14,0.51],["Joe Barry Carroll",16,20.36,8.3,1.93,1.08,1.72],["Robert Parish",16,17,10.9,1.7,0.8,1.6]]],
    ["362","1980s",[["Maurice Cheeks",1,12.63,2.96,7.49,2.28,0.33],["Lionel Hollins",3,10.52,2.34,4.1,1.36,0.21],["Julius Erving",6,22.03,6.41,3.8,1.8,1.63],["Hersey Hawkins",2,15.1,2.8,3,1.5,0.5],["Charles Barkley",12,22.14,11.98,3.55,1.61,1.23],["Cliff Robinson",28,16.82,6,1.91,1.42,0.5],["Moses Malone",16,23.93,13.42,1.38,0.95,1.53],["Mike Gminski",16,17.09,9.8,1.74,0.67,1.48]]],
    ["353","2010s",[["LeBron James",31,27.4,8.5,8.3,1.3,0.6],["Lonzo Ball",1,10.06,6.14,6.35,1.61,0.61],["Kobe Bryant",6,24.67,5.11,4.78,1.25,0.23],["Dwight Howard",24,17.1,12.4,1.4,1.1,2.4]]],
    ["368","2010s",[["Deron Williams",1,19.77,3.96,10.17,1.26,0.2],["Donovan Mitchell",3,22.13,3.9,3.95,1.45,0.35],["George Hill",3,16.9,3.4,4.2,1,0.2],["Andrei Kirilenko",12,11.8,4.86,2.86,1.35,1.2],["Gordon Hayward",12,15.64,4.17,3.42,1.01,0.41],["Carlos Boozer",24,19.5,11.2,3.2,1.1,0.5],["Al Jefferson",24,18.48,9.5,2.02,0.8,1.56]]],
    ["356","1990s",[["Terrell Brandon",1,16.04,3.5,7.52,2.06,0.28],["Eric Murdock",1,14,3.18,6.8,2,0.13],["Alvin Robertson",2,12.72,5.33,4.97,2.67,0.26],["Jay Humphries",3,14.87,2.91,6.36,1.74,0.13],["Glenn Robinson",4,21.08,6.09,2.89,1.24,0.62],["Ken Norman",4,11.9,6.1,2.7,0.7,0.6],["Vin Baker",24,18.29,9.52,2.73,0.87,1.32],["Tyrone Hill",24,9.68,10.06,1.39,1.18,0.5],["Moses Malone",16,14.29,8.52,1.04,0.81,0.79]]],
    ["360","1990s",[["Gary Payton",1,16.35,3.84,6.83,2.29,0.22],["Ricky Pierce",3,18.46,2.44,2.65,1.05,0.17],["Kendall Gill",6,13.91,3.69,3.07,1.76,0.4],["Xavier McDaniel",12,21.39,6.3,2.5,1.21,0.46],["Detlef Schrempf",12,16.56,6.29,4,0.92,0.26],["Shawn Kemp",24,16.24,9.58,1.74,1.24,1.54],["Vin Baker",24,17.62,7.47,1.81,1.04,1]]],
    ["359","1960s",[["Walt Frazier",1,13.42,5.24,6.07,0,0],["Dick Garmaker",3,14.88,4.14,3.02,0,0],["Richie Guerin",2,23.59,6.29,5.97,0,0],["Dick Barnett",2,18.93,3.36,3.13,0,0],["Willie Naulls",12,22.74,12.61,2.33,0,0],["Dave DeBusschere",12,16.4,11.4,2.7,0,0],["Willis Reed",24,19.61,13.74,1.77,0,0],["Walt Bellamy",16,18.93,13.29,2.47,0,0]]],
    ["349","1960s",[["Guy Rodgers",3,12.98,5.02,8.47,0,0],["Jim King",3,11.94,4.1,3.55,0,0],["Tom Gola",6,14.22,9.61,4.65,0,0],["Rick Barry",4,30.59,9.91,2.89,0,0],["Paul Arizin",4,22.47,7.99,2.44,0,0],["Nate Thurmond",24,16.42,17.93,2.39,0,0],["Rudy LaRusso",12,21.26,8.86,2.2,0,0],["Wilt Chamberlain",16,41.46,25.1,3.02,0,0]]],
    ["355","1980s",[["Kevin Edwards",3,13.8,3.3,4.4,1.8,0.3],["Rory Sparrow",1,12.5,2.7,5.4,1.3,0.2],["Jon Sundvold",3,10.4,1.3,2,0.4,0],["Billy Thompson",4,10.8,7.2,2.2,0.7,1.3],["Sylvester Gray",4,8,5.2,2.1,0.7,0.5],["Grant Long",8,11.9,6.7,1.8,1.5,0.6],["Pat Cummings",24,8.8,5.3,0.9,0.5,0.3],["Rony Seikaly",16,10.9,7,0.7,0.6,1.2]]],
    ["365","1980s",[["Danny Ainge",3,20.3,3.6,6.7,1.5,0.3],["Ray Williams",3,15.4,4.5,7.9,1.7,0.4],["Cliff Robinson",28,20.2,8.5,1.9,1.2,1.6],["Scott Wedman",4,19,5.48,2.48,1.2,0.65],["Wayman Tisdale",8,19.8,9.6,1.7,0.6,0.6],["Sam Lacey",16,7.98,7.48,5.26,1.3,1.39]]],
    ["359","2010s",[["Jeremy Lin",1,14.6,3.1,6.2,1.6,0.3],["Raymond Felton",3,13.36,3.14,6.55,1.45,0.27],["Chauncey Billups",3,17.5,3.1,5.5,0.9,0.1],["David Lee",28,20.2,11.7,3.6,1,0.5],["Carmelo Anthony",12,24.71,6.96,3.24,0.96,0.52],["Kristaps Porziņģis",24,17.82,7.08,1.35,0.73,2.06]]],
    ["361","2020s",[["Cole Anthony",1,13.4,4.7,4.2,0.7,0.4],["Jalen Suggs",3,12.9,3.5,3.8,1.4,0.6],["Desmond Bane",2,19.6,5.1,4.7,1.1,0.5],["Franz Wagner",4,19.7,5,3.6,1,0.3],["Otto Porter Jr.",12,9.7,5.4,2,0.6,0.1],["Paolo Banchero",8,22.7,7.4,4.8,0.8,0.6],["Wendell Carter Jr.",24,12.2,8.2,2.1,0.7,0.6],["Mo Bamba",16,9.3,6.9,1,0.4,1.5]]],
    ["359","1980s",[["Mark Jackson",1,15.14,4.75,9.66,2.22,0.1],["Ray Williams",3,18.54,4.22,5.87,2.13,0.37],["Gerald Wilkins",6,15.81,3.15,3.45,1.1,0.23],["Bernard King",4,26.5,5.19,2.82,1.16,0.22],["Campy Russell",4,15.17,3.81,3.5,1.15,0.15],["Patrick Ewing",24,21.19,8.8,1.9,1.34,2.82],["Maurice Lucas",8,15.8,11.3,2.2,0.9,0.9],["Charles Oakley",24,12.9,10.5,2.3,1.3,0.2]]],
    ["346","2010s",[["Luka Dončić",7,21.2,7.8,6,1.1,0.3],["Jason Kidd",3,8.43,4.79,7.92,1.74,0.35],["Monta Ellis",2,18.95,3.01,4.91,1.8,0.3],["Harrison Barnes",12,18.73,5.22,1.64,0.7,0.2],["Dirk Nowitzki",24,18.25,6.29,2.07,0.65,0.63],["Tyson Chandler",24,10.2,10.46,0.75,0.55,1.15],["DeAndre Jordan",16,11,13.7,2,0.7,1.1]]],
    ["360","1980s",[["Gus Williams",3,21.06,2.93,7.01,2.33,0.4],["Dennis Johnson",3,19,5.1,4.1,1.8,1],["Dale Ellis",6,26.07,4.74,2.5,1.21,0.27],["Xavier McDaniel",12,20.49,7.13,2.46,1.2,0.57],["Jack Sikma",24,17.91,10.97,3.55,1.11,1.07],["Michael Cage",24,10.3,9.6,1.6,1.2,0.7]]],
    ["366","2020s",[["Dejounte Murray",3,18.4,7.7,7.3,1.8,0.2],["De'Aaron Fox",1,21.1,4.3,6.2,1.4,0.3],["DeMar DeRozan",14,21.6,4.2,6.9,0.9,0.2],["Keldon Johnson",4,15.6,5.5,2.1,0.7,0.2],["Jeremy Sochan",8,11.3,6.1,2.8,0.8,0.5],["Victor Wembanyama",16,23.6,11,3.6,1.1,3.5],["Jakob Poeltl",16,11.1,8.6,2.3,0.7,1.8]]],
    ["356","2010s",[["Giannis Antetokounmpo",29,18.81,8.28,4.12,1.21,1.33],["Eric Bledsoe",3,16.81,4.27,5.31,1.74,0.5],["Monta Ellis",2,18.87,3.82,5.98,1.96,0.38],["Khris Middleton",6,16.29,4.6,3.37,1.34,0.18],["Andrew Bogut",24,14.14,10.44,1.95,0.68,2.5]]],
    ["368","1980s",[["John Stockton",1,10.6,2.24,9.62,2.32,0.16],["Rickey Green",1,11.42,2.29,6.86,1.82,0.07],["Darrell Griffith",2,18.46,3.71,2.52,1.35,0.36],["Terry Furlow",2,16,2.8,4,1,0.3],["Adrian Dantley",4,29.58,6.18,3.69,1.09,0.14],["Thurl Bailey",12,15.22,5.93,1.68,0.55,1.32],["Karl Malone",8,23.34,10.5,2.47,1.45,0.67],["Mark Eaton",16,7,8.65,1.23,0.41,4.21],["Ben Poquette",24,8.96,6.59,1.71,0.7,1.6]]],
    ["352","1970s",[["World B. Free",3,28.8,3.9,4.4,1.4,0.4],["Walt Hazzard",3,14.7,2.79,5.19,0,0],["Billy Knight",6,22.9,7.2,3,1.5,0.2],["Randy Smith",6,18.69,4.46,5.09,2.08,0.05],["Bob McAdoo",24,28.24,12.67,2.59,1.14,2.42],["Gar Heard",8,12.52,10.71,2.48,1.57,2.03],["Elmore Smith",16,17.79,13.82,1.94,0,0]]],
    ["343","1990s",[["Kenny Anderson",1,15.2,2.7,8.6,1.6,0.2],["David Wesley",3,13.42,2.83,6.46,1.81,0.32],["Larry Johnson",14,19.65,9.22,4.14,0.79,0.41],["Eddie Jones",6,17,3.9,4.2,3,1.1],["Anthony Mason",28,14.41,10.77,4.91,0.89,0.34],["Alonzo Mourning",24,21.25,10.13,1.25,0.46,3.17]]],
    ["360","2000s",[["Gary Payton",1,22.72,5.22,8.7,1.72,0.25],["Russell Westbrook",1,15.3,4.9,5.3,1.3,0.2],["Ray Allen",2,24.57,4.64,4.2,1.31,0.16],["Kevin Durant",14,22.7,5.41,2.59,1.14,0.8],["Rashard Lewis",12,17.09,5.98,1.75,1.18,0.62],["Vin Baker",24,14.35,6.64,1.49,0.51,0.85],["Kurt Thomas",24,7.5,8.8,1.3,0.8,1]]],
    ["346","2020s",[["Luka Dončić",7,30.6,8.7,8.8,1.2,0.5],["Kyrie Irving",3,25.8,5,5.1,1.2,0.6],["Cooper Flagg",12,21,6.7,4.5,1.2,0.9],["Anthony Davis",24,24.7,11.6,3.5,1.2,2.2],["Kristaps Porziņģis",24,20.1,8.9,1.6,0.5,1.3]]],
    ["345","1990s",[["Mark Price",1,17.74,2.8,8.03,1.34,0.12],["Brevin Knight",1,9.2,3.27,8.04,2.27,0.2],["Craig Ehlo",2,11.87,4.98,4.04,1.41,0.33],["Wesley Person",6,13.46,3.97,2.12,1.32,0.53],["Chris Mills",12,12.56,5.35,2.1,0.85,0.55],["Larry Nance",8,16.71,8.33,2.73,0.84,2.47],["Shawn Kemp",24,18.86,9.27,2.47,1.3,1.1],["Brad Daugherty",16,19.88,10.27,3.56,0.84,0.77]]],
    ["344","2010s",[["Derrick Rose",1,20.44,3.63,6.16,0.79,0.4],["Zach LaVine",7,21.77,4.48,4.09,1,0.34],["Dwyane Wade",3,18.3,4.5,3.8,1.4,0.7],["Luol Deng",12,16.97,6.48,2.75,1,0.61],["Pau Gasol",24,17.54,11.42,3.37,0.44,1.95],["Carlos Boozer",24,15.51,9.04,2.06,0.82,0.35],["Joakim Noah",16,10.29,10.44,3.64,0.86,1.5]]],
    ["347","1970s",[["Charlie Scott",3,12,2.7,5.4,1,0.4],["Brian Taylor",1,11.6,2.5,3.4,1.8,0.2],["David Thompson",2,25.73,4.21,3.88,1.17,0.96],["Bob Wilkerson",6,11.4,5.55,4.51,1.55,0.3],["Bobby Jones",12,14.81,8.4,3.3,2.06,1.86],["George McGinnis",8,22.6,11.4,3.7,1.7,0.7],["Dan Issel",16,20.19,9.34,3.01,1.07,0.5],["Darnell Hillman",24,7.8,7.2,1.6,0.4,1.1]]],
    ["369","1960s",[["Earl Monroe",3,25.04,4.61,4.6,0,0],["Don Ohl",3,18.93,3.73,3.21,0,0],["Terry Dischinger",6,20.8,8.3,2,0,0],["Gus Johnson",12,18.5,12.72,2.7,0,0],["Bailey Howell",12,18.36,10.41,2.3,0,0],["Walt Bellamy",16,25.57,15.66,2.01,0,0],["Wes Unseld",16,13.8,18.2,2.6,0,0]]],
    ["361","2010s",[["Victor Oladipo",3,15.82,4.36,4.04,1.63,0.53],["Elfrid Payton",1,11.15,4.19,6.44,1.36,0.34],["Vince Carter",14,16.26,3.95,3.05,0.75,0.18],["Tobias Harris",12,15.57,6.97,1.74,0.9,0.61],["Aaron Gordon",12,12.45,6.22,2.15,0.76,0.64],["Dwight Howard",24,20.56,13.86,1.68,1.23,2.48],["Serge Ibaka",24,15.1,6.8,1.1,0.6,1.6],["Nikola Vučević",16,16.76,10.71,2.65,0.91,0.97]]],
    ["363","1980s",[["Kevin Johnson",1,18.4,4.23,11.3,1.65,0.3],["Dennis Johnson",3,17.54,4.7,4.43,1.43,0.67],["Walter Davis",6,19.54,2.67,4.51,1.29,0.14],["Armen Gilliam",12,15.43,7.56,0.96,0.87,0.44],["Tom Chambers",8,25.7,8.4,2.9,1.1,0.7],["Larry Nance",8,17.32,7.81,2.56,1.04,1.92],["Alvan Adams",24,12.56,6.24,3.86,1.25,0.68],["Mark West",16,8.4,7.12,0.58,0.5,2.3]]],
    ["365","1970s",[["Oscar Robertson",1,25.3,6.1,8.1,0,0],["Tiny Archibald",1,25.17,2.79,8.09,1.56,0.16],["Ron Boone",2,19.95,3.6,3.95,1.4,0.15],["Norm Van Lier",3,12.45,6.04,7.98,0,0],["Scott Wedman",4,15.56,6.16,2.27,1.14,0.34],["Tom Van Arsdale",6,20.02,5.39,2.26,0,0],["Richard Washington",8,11.81,7.87,1.16,0.8,0.92],["Ron Behagen",8,10.59,7,1.74,0.67,0.48],["Sam Lacey",16,11.88,11.25,3.73,1.55,1.8],["Connie Dierking",16,16.56,8.18,2.18,0,0]]],
    ["350","2020s",[["John Wall",1,20.6,3.2,6.9,1.1,0.8],["Fred VanVleet",3,15.8,3.8,6.8,1.5,0.6],["Kevin Durant",14,26,5.5,4.8,0.8,0.9],["Khyri Thomas",2,16.4,3.6,5,1.8,1.2],["Amen Thompson",4,14,7.5,3.9,1.4,0.8],["Christian Wood",24,19.4,9.8,2,0.8,1.1],["Alperen Sengun",16,17,8.6,4.5,1,0.9]]],
    ["367","2020s",[["Fred VanVleet",3,19.7,4.2,6.7,1.7,0.6],["Kyle Lowry",1,17.2,5.4,7.3,1,0.3],["Scottie Barnes",14,17.6,7.5,5.2,1.3,1.1],["Brandon Ingram",12,21.9,5.6,4.5,0.9,0.6],["Pascal Siakam",8,22.8,7.8,5.2,1.1,0.6],["Jakob Poeltl",16,12.2,8.6,2.5,0.9,1.1],["Kelly Olynyk",24,9.8,5.3,4.4,0.9,0.4]]],
    ["340","2020s",[["Trae Young",1,26,3.3,10.3,1.1,0.2],["Dejounte Murray",3,21.5,5.3,6.2,1.4,0.3],["Dyson Daniels",3,13,6.3,5.2,2.5,0.6],["Jalen Johnson",12,13.1,6.8,3.6,0.9,0.6],["Saddiq Bey",4,13.8,5.6,1.5,0.9,0.2],["John Collins",8,15.6,7.2,1.4,0.6,1],["Clint Capela",16,11.7,11.3,1,0.7,1.4],["Onyeka Okongwu",16,10.2,6.6,1.5,0.7,1.1]]],
    ["365","1990s",[["Danny Ainge",3,17.9,4.3,6,1.5,0.2],["Kenny Smith",1,15,2.6,6.6,1.2,0.2],["Mitch Richmond",2,23.35,3.75,4.11,1.31,0.28],["Rodney McCray",12,16.6,8.2,4.6,0.7,0.9],["Antoine Carr",28,19.65,5.41,2.35,0.57,1.21],["Chris Webber",24,20,13,4.1,1.4,2.1],["Vlade Divac",16,14.3,10,4.3,0.9,1]]],
    ["368","2020s",[["Donovan Mitchell",3,26.1,4.3,5.2,1.2,0.2],["Kennedy Chandler",1,15,3.4,6.7,1,0.2],["Andersson Garcia",6,5.2,8.4,2.8,1.6,0.8],["Lauri Markkanen",12,23.6,7.4,1.9,0.8,0.5],["Jaren Jackson Jr.",24,19.4,5.7,2,1.1,1.4],["Rudy Gobert",16,14.9,14.1,1.2,0.6,2.4],["Jusuf Nurkić",16,10.9,10.4,4.8,1.3,0.5]]],
  ];
  const ROLLOUT_CURRENT_SAMPLES = 28;
  const ROLLOUT_RETRY_SAMPLES = 7;
  const ROLLOUT_CURRENT_ACTIONS = 32;
  const ROLLOUT_RETRY_ACTIONS = 1;
  const ROLLOUT_ROWS_PER_POSITION = 3;
  const ONE_V_ONE_CURRENT_SAMPLES = 14;
  const ONE_V_ONE_RETRY_SAMPLES = 7;
  const ONE_V_ONE_CURRENT_ACTIONS = 18;
  const ONE_V_ONE_RETRY_ACTIONS = 1;
  const ANALYSIS_YIELD_EVERY = 6;
  const CURRENT_ANALYSIS_MAX_MS = 5_000;
  const RETRY_ANALYSIS_MAX_MS = 1_500;
  const ONE_V_ONE_ANALYSIS_MAX_MS = 1_500;
  const PATH_CONFIDENCE_Z = 1.645;
  const MIN_PATH_ADVANTAGE = 0.08;

  // These are algebraically identical to the current production team formula.
  const COEFF_PPG = (100 * 0.46) / 133.4;
  const COEFF_RPG = (100 * 0.25) / 39.7;
  const COEFF_APG = (100 * 0.18) / 29.3;
  const COEFF_SPG = Array.from({ length: 6 }, (_, count) =>
    count ? ((100 * 0.07) / 6.1) * (5 / count) : 0,
  );
  const COEFF_BPG = Array.from({ length: 6 }, (_, count) =>
    count ? ((100 * 0.04) / 3.2) * (5 / count) : 0,
  );

  const COLORS = Object.freeze({
    pick: "#22c55e",
    team: "#f59e0b",
    era: "#a855f7",
    position: "#38bdf8",
    impossible: "#ef4444",
    muted: "#94a3b8",
  });

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function positiveNumber(value) {
    const number = finiteNumber(value);
    return number > 0 ? number : 0;
  }

  function roundOne(value) {
    return Math.round(value * 10) / 10;
  }

  function matchupResult(score, opponentScore) {
    const user = roundOne(finiteNumber(score));
    const opponent = roundOne(finiteNumber(opponentScore));
    return user > opponent ? "win" : user < opponent ? "loss" : "draw";
  }

  function opponentFromSessionPayload(payload) {
    const roots = [payload, payload?.result, payload?.data].filter(Boolean);
    for (const root of roots) {
      const opponent = root?.opponent;
      if (!opponent || typeof opponent !== "object") continue;
      const score = Number(opponent.score);
      if (!Number.isFinite(score) || score < 0 || score > 200) continue;
      return {
        score,
        roster: opponent.roster || null,
        pickOrder: Array.isArray(opponent.pick_order)
          ? [...opponent.pick_order]
          : [],
      };
    }
    return null;
  }

  function resolveSquadRows(squad, byId, byKey, cell) {
    if (!Array.isArray(squad)) return [];
    const rows = [];
    const seen = new Set();
    for (const player of squad) {
      const id = player?.id ?? player?.player_id;
      let row =
        id !== undefined && id !== null ? byId.get(String(id)) : null;
      if (!row && player?.name) {
        const team = player.team || player.team_abbr || cell.team;
        const era = player.era || cell.era;
        row = byKey.get(`${player.name}|${team}|${era}`) || null;
      }
      if (!row || seen.has(row.key)) continue;
      seen.add(row.key);
      rows.push(row);
    }
    return rows;
  }

  function normalizeDealtCell(cell) {
    if (!cell || !Number.isFinite(Number(cell.seq)) ||
        !ERAS.has(cell.era) || !Array.isArray(cell.squad)) return null;
    const teamId = typeof cell.team === "object"
      ? cell.team?.team_id : cell.team;
    const team = typeof cell.team === "object"
      ? cell.team?.abbr || teamId : cell.team_abbr || cell.team;
    if (!team || !teamId) return null;
    return {
      ...cell,
      seq: Number(cell.seq),
      team: String(team),
      teamId: String(teamId),
      squad: cell.squad.map((player) => ({
        ...player,
        // v4 person IDs repeat across teams and eras; card identity needs all three.
        id: [player.player_id ?? player.id, player.team_id ?? teamId,
          player.era || cell.era].join("|"),
        team: String(team),
        era: player.era || cell.era,
        hasStats: ["ppg", "rpg", "apg"].every((key) =>
          player.stats?.[key] !== null && player.stats?.[key] !== undefined &&
          Number.isFinite(Number(player.stats[key]))),
      })),
    };
  }

  function bestLivePick(rows, entries) {
    const states = reachableRosterStates(entries);
    const fixed = entries.map((entry) => entry.row);
    const used = new Set(fixed.map((row) => row.player));
    let best = null;
    for (const row of rows) {
      if (used.has(row.player)) continue;
      const plan = shortestPlacementPlan(states, row);
      if (!plan || !movePlanUpgradesOccupiedPosition(entries, row, plan)) continue;
      const result = calculateTeamResult([...fixed, row]);
      // Before the last pick, value production with full-team defensive weights.
      // The last pick is ranked by the exact final team formula.
      const value = entries.length === 4 ? result.raw : rolloutRowValue(row);
      if (!best || value > best.value + EPSILON ||
          (Math.abs(value - best.value) <= EPSILON &&
           plan.moves.length < best.moves.length)) {
        best = { row, position: plan.position, moves: plan.moves, result, value };
      }
    }
    return best;
  }

  function livePriorPools() {
    return LIVE_PRIOR_CELLS.map(([teamId, era, players]) => ({
      teamId, era,
      rows: players.map(([player, posMask, ppg, rpg, apg, spg, bpg]) => ({
        player, posMask, ppg, rpg, apg, spg, bpg,
      })),
    }));
  }

  // Finite-horizon stochastic dynamic programming over open slots and the two
  // free retries. Unlike greedy stat ranking, each placement carries the cost
  // of closing that position, and using a retry sacrifices its later value.
  // Future offers are a sampled model, not known deals. Hypothetical future
  // player-name collisions and lineup moves are not in this compact state.
  class FixedSlotDraftPlanner {
    constructor(pools, entries) {
      this.entries = entries;
      this.fixed = entries.map((entry) => entry.row);
      const used = new Set(this.fixed.map((row) => row.player));
      this.pools = pools.map((pool) => ({
        ...pool, rows: pool.rows.filter((row) => !used.has(row.player)),
      }));
      this.memo = new Map();
      this.retryTableMemo = new WeakMap();
      const rows = this.pools.flatMap((pool) => pool.rows);
      // Predict recorded-defense counts rather than treating old missing stats
      // as zero contributions to a five-player denominator.
      const expectedCount = (key) => this.fixed.filter((row) => row[key] > 0).length +
        (5 - this.fixed.length) * (rows.length
          ? rows.filter((row) => row[key] > 0).length / rows.length : 1);
      this.stealWeight = (100 * 0.07 / 6.1) * 5 / Math.max(1, expectedCount("spg"));
      this.blockWeight = (100 * 0.04 / 3.2) * 5 / Math.max(1, expectedCount("bpg"));
    }

    value(row) {
      if (this.fixed.length === 4)
        return rawTeamScore([...this.fixed, row]) - rawTeamScore(this.fixed);
      return COEFF_PPG * row.ppg + COEFF_RPG * row.rpg + COEFF_APG * row.apg +
        this.stealWeight * row.spg + this.blockWeight * row.bpg;
    }

    retryExpectation(table, cell, scope) {
      // Exclude the unchanged dimension's present outcome. Conditional samples
      // are shrunk toward the global sample (eight pseudo-cells) to avoid
      // recommending retries on the strength of one lucky historical offer.
      if (!this.retryTableMemo.has(table)) {
        const summary = { sum: 0, count: table.length, teams: new Map(),
          eras: new Map(), cells: new Map() };
        const add = (map, key, value) => {
          const group = map.get(key) || { sum: 0, count: 0 };
          group.sum += value;
          group.count += 1;
          map.set(key, group);
        };
        for (let index = 0; index < this.pools.length; index += 1) {
          const pool = this.pools[index];
          summary.sum += table[index];
          add(summary.teams, pool.teamId, table[index]);
          add(summary.eras, pool.era, table[index]);
          add(summary.cells, `${pool.teamId}|${pool.era}`, table[index]);
        }
        this.retryTableMemo.set(table, summary);
      }
      const summary = this.retryTableMemo.get(table);
      const empty = { sum: 0, count: 0 };
      const excluded = (scope === "team" ? summary.teams.get(cell.teamId) :
        summary.eras.get(cell.era)) || empty;
      const eligibleCount = summary.count - excluded.count;
      if (!eligibleCount) return null;
      const group = (scope === "team" ? summary.eras.get(cell.era) :
        summary.teams.get(cell.teamId)) || empty;
      const sameCell = summary.cells.get(`${cell.teamId}|${cell.era}`) || empty;
      const global = (summary.sum - excluded.sum) / eligibleCount;
      return (group.sum - sameCell.sum + 8 * global) /
        (group.count - sameCell.count + 8);
    }

    state(mask, team, era) {
      if (mask === FULL_POSITION_MASK) return { mean: 0, table: this.pools.map(() => 0) };
      const key = `${mask}:${team}:${era}`;
      if (this.memo.has(key)) return this.memo.get(key);
      const afterPick = POSITIONS.map((_, index) => mask & (1 << index)
        ? null : this.state(mask | (1 << index), team, era));
      const afterTeam = team ? this.state(mask, 0, era) : null;
      const afterEra = era ? this.state(mask, team, 0) : null;
      const table = this.pools.map((pool) => {
        let value = -25; // model penalty for a sampled offer with no legal pick
        for (const row of pool.rows) for (let index = 0; index < 5; index += 1) {
          if (!(row.posMask & (1 << index)) || !afterPick[index]) continue;
          value = Math.max(value, this.value(row) + afterPick[index].mean);
        }
        if (afterTeam) value = Math.max(value,
          this.retryExpectation(afterTeam.table, pool, "team") ?? -Infinity);
        if (afterEra) value = Math.max(value,
          this.retryExpectation(afterEra.table, pool, "era") ?? -Infinity);
        return value;
      });
      const result = { table, mean: table.reduce((sum, value) => sum + value, 0) /
        Math.max(1, table.length) };
      this.memo.set(key, result);
      return result;
    }

    advise(rows, cell, retries) {
      const states = reachableRosterStates(this.entries);
      const used = new Set(this.fixed.map((row) => row.player));
      const team = Number(Boolean(retries.team));
      const era = Number(Boolean(retries.era));
      const mask = this.entries.reduce((bits, entry) => bits |
        (1 << POSITION_INDEX[entry.position]), 0);
      let best = null;
      for (const row of rows) {
        if (used.has(row.player)) continue;
        const direct = row.posMask & ~mask;
        for (const position of POSITIONS) {
          const bit = 1 << POSITION_INDEX[position];
          if (!(row.posMask & bit) || (direct && !(direct & bit))) continue;
          const plan = shortestPlacementPlan(states, row, null, position);
          if (!plan || !movePlanUpgradesOccupiedPosition(this.entries, row, plan)) continue;
          const value = this.value(row) + this.state(plan.postMask, team, era).mean;
          if (!best || value > best.value + EPSILON ||
              (Math.abs(value - best.value) <= EPSILON && plan.moves.length < best.moves.length))
            best = { row, ...plan, value, result: calculateTeamResult([...this.fixed, row]) };
        }
      }
      const forecasts = {
        team: team ? this.retryExpectation(this.state(mask, 0, era).table, cell, "team") : null,
        era: era ? this.retryExpectation(this.state(mask, team, 0).table, cell, "era") : null,
      };
      let kind = "pick";
      let value = best?.value ?? -Infinity;
      for (const scope of ["team", "era"]) {
        if (forecasts[scope] !== null && forecasts[scope] > value + (best ? 0.5 : 0)) {
          kind = scope;
          value = forecasts[scope];
        }
      }
      // With no known legal pick, an available retry is still the useful advice
      // even when there are no compatible historical samples for its scope.
      if (!best && kind === "pick") kind = team ? "team" : era ? "era" : "dead";
      return { kind, best, forecasts, sampleCount: this.pools.length };
    }
  }

  // A family is an unsigned bitset of every feasible occupied-position mask.
  // Adding a player's eligibility updates ALL legal roster assignments, not
  // just the position at which the user happened to place that player.
  function extendRosterFamily(family, eligibility) {
    let result = 0;
    for (let mask = 0; mask <= FULL_POSITION_MASK; mask += 1) {
      if (!(family & (1 << mask))) continue;
      for (let position = 0; position < 5; position += 1) {
        const bit = 1 << position;
        if (!(mask & bit) && (eligibility & bit)) result |= 1 << (mask | bit);
      }
    }
    return result >>> 0;
  }

  function rosterFamily(rows) {
    return (rows || []).reduce((family, row) =>
      extendRosterFamily(family, row.posMask), 1);
  }

  class LiveDraftPlanner extends FixedSlotDraftPlanner {
    constructor(pools, entries) {
      super(pools, entries);
      this.initialFamily = rosterFamily(this.fixed);
      // Under this additive planning approximation, equal-eligibility players
      // share a continuation. Keep the highest value per eligibility profile
      // in each future pool; all live offered players are still evaluated.
      this.profiles = this.pools.map((pool) => {
        const strongest = new Map();
        for (const row of pool.rows) {
          const value = this.value(row);
          if (!strongest.has(row.posMask) || strongest.get(row.posMask) < value)
            strongest.set(row.posMask, value);
        }
        return [...strongest].map(([mask, value]) => ({ mask, value }));
      });
      this.transitionMemo = new Map();
      this.tailMemo = new Map();
      this.tailProfiles = this.fixed.length === 3 ? this.pools.map((pool) =>
        Array.from({ length: 4 }, (_, incomingSignature) => {
          const groups = new Map();
          for (const row of pool.rows) {
            const steals = Number(row.spg > 0);
            const blocks = Number(row.bpg > 0);
            const signature = steals | (blocks << 1);
            const ks = this.fixed.filter((fixed) => fixed.spg > 0).length +
              (incomingSignature & 1) + steals;
            const kb = this.fixed.filter((fixed) => fixed.bpg > 0).length +
              ((incomingSignature >> 1) & 1) + blocks;
            const value = COEFF_PPG * row.ppg + COEFF_RPG * row.rpg +
              COEFF_APG * row.apg + COEFF_SPG[ks] * row.spg + COEFF_BPG[kb] * row.bpg;
            const key = `${row.posMask}:${signature}`;
            const top = groups.get(key) || [];
            top.push({ row, value });
            top.sort((a, b) => b.value - a.value);
            // The incoming player can eliminate one name; retaining the best
            // two distinct names preserves the exact last-pick maximum.
            const distinct = top.filter((entry, index) =>
              top.findIndex((other) => other.row.player === entry.row.player) === index).slice(0, 2);
            groups.set(key, distinct);
          }
          return [...groups.values()].flat().map((entry) => entry.row);
        })) : null;
    }

    extend(family, eligibility) {
      const key = `${family}:${eligibility}`;
      if (!this.transitionMemo.has(key))
        this.transitionMemo.set(key, extendRosterFamily(family, eligibility));
      return this.transitionMemo.get(key);
    }

    tailCompletion(row, team, era) {
      const key = JSON.stringify([row.player, row.posMask, row.ppg, row.rpg,
        row.apg, row.spg, row.bpg, team, era]);
      if (this.tailMemo.has(key)) return this.tailMemo.get(key);
      const family = this.extend(this.initialFamily, row.posMask);
      const fixed = [...this.fixed, row];
      const offset = rawTeamScore(this.fixed);
      const afterTeam = team ? this.tailCompletion(row, 0, era) : null;
      const afterEra = era ? this.tailCompletion(row, team, 0) : null;
      const base = team || era ? this.tailCompletion(row, 0, 0) : null;
      const signature = Number(row.spg > 0) | (Number(row.bpg > 0) << 1);
      const table = this.pools.map((pool, index) => {
        let value = base ? base.table[index] : -25;
        if (!base) for (const future of this.tailProfiles[index][signature]) {
          if (future.player === row.player || !this.extend(family, future.posMask)) continue;
          value = Math.max(value, rawTeamScore([...fixed, future]) - offset);
        }
        if (afterTeam) value = Math.max(value,
          this.retryExpectation(afterTeam.table, pool, "team") ?? -Infinity);
        if (afterEra) value = Math.max(value,
          this.retryExpectation(afterEra.table, pool, "era") ?? -Infinity);
        return value;
      });
      const result = { table, mean: table.reduce((sum, value) => sum + value, 0) /
        Math.max(1, table.length) };
      this.tailMemo.set(key, result);
      return result;
    }

    state(family, team, era) {
      if (family === (1 << FULL_POSITION_MASK) >>> 0)
        return { mean: 0, table: this.pools.map(() => 0) };
      const key = `${family}:${team}:${era}`;
      if (this.memo.has(key)) return this.memo.get(key);
      const afterTeam = team ? this.state(family, 0, era) : null;
      const afterEra = era ? this.state(family, team, 0) : null;
      if (this.fixed.length === 3 && family === this.initialFamily) {
        // With two picks left, compare complete five-player scores directly:
        // exact defense normalization and no reuse of the incoming player.
        const table = this.pools.map((pool) => {
          let value = -25;
          for (const row of pool.rows) {
            if (!this.extend(family, row.posMask)) continue;
            value = Math.max(value, this.tailCompletion(row, team, era).mean);
          }
          if (afterTeam) value = Math.max(value,
            this.retryExpectation(afterTeam.table, pool, "team") ?? -Infinity);
          if (afterEra) value = Math.max(value,
            this.retryExpectation(afterEra.table, pool, "era") ?? -Infinity);
          return value;
        });
        const result = { table, mean: table.reduce((sum, value) => sum + value, 0) /
          Math.max(1, table.length) };
        this.memo.set(key, result);
        return result;
      }
      const table = this.profiles.map((profiles, index) => {
        let value = -25;
        for (const profile of profiles) {
          const next = this.extend(family, profile.mask);
          if (!next) continue;
          value = Math.max(value, profile.value + this.state(next, team, era).mean);
        }
        if (afterTeam) value = Math.max(value,
          this.retryExpectation(afterTeam.table, this.pools[index], "team") ?? -Infinity);
        if (afterEra) value = Math.max(value,
          this.retryExpectation(afterEra.table, this.pools[index], "era") ?? -Infinity);
        return value;
      });
      const result = { table, mean: table.reduce((sum, value) => sum + value, 0) /
        Math.max(1, table.length) };
      this.memo.set(key, result);
      return result;
    }

    advise(rows, cell, retries) {
      const states = reachableRosterStates(this.entries);
      const used = new Set(this.fixed.map((row) => row.player));
      const team = Number(Boolean(retries.team));
      const era = Number(Boolean(retries.era));
      let best = null;
      for (const row of rows) {
        if (used.has(row.player)) continue;
        const next = this.extend(this.initialFamily, row.posMask);
        if (!next) continue;
        // Any incoming player may justify a move if the full team benefits.
        // A shortest empty-slot route avoids unnecessary moves and swaps.
        const plan = shortestPlacementPlan(states, row);
        if (!plan) continue;
        const value = this.fixed.length === 3 ? this.tailCompletion(row, team, era).mean :
          this.value(row) + this.state(next, team, era).mean;
        if (!best || value > best.value + EPSILON ||
            (Math.abs(value - best.value) <= EPSILON && plan.moves.length < best.moves.length))
          best = { row, ...plan, value, result: calculateTeamResult([...this.fixed, row]) };
      }
      if (best) {
        // Equal-score arrangements differ only in how soon a later pick might
        // need a move. Prefer a natural open slot without changing the player
        // or sacrificing score, then show the shortest realizable route.
        const placement = new FixedSlotDraftPlanner(this.pools, this.entries);
        let ease = -Infinity;
        for (const position of POSITIONS) {
          const plan = shortestPlacementPlan(states, best.row, null, position);
          if (!plan || plan.moves.length !== best.moves.length) continue;
          const futureEase = placement.state(plan.postMask, team, era).mean;
          if (futureEase > ease + EPSILON) {
            ease = futureEase;
            best = { ...best, ...plan };
          }
        }
      }
      const forecasts = {
        team: team ? this.retryExpectation(this.state(this.initialFamily, 0, era).table, cell, "team") : null,
        era: era ? this.retryExpectation(this.state(this.initialFamily, team, 0).table, cell, "era") : null,
      };
      let kind = "pick";
      let value = best?.value ?? -Infinity;
      for (const scope of ["team", "era"]) {
        if (forecasts[scope] !== null && forecasts[scope] > value + EPSILON) {
          kind = scope;
          value = forecasts[scope];
        }
      }
      if (!best && kind === "pick") kind = team ? "team" : era ? "era" : "dead";
      return { kind, best, forecasts, sampleCount: this.pools.length };
    }
  }

  function popcount(value) {
    let count = 0;
    for (let bits = value >>> 0; bits; bits &= bits - 1) count += 1;
    return count;
  }

  function positionMask(positions) {
    let mask = 0;
    for (const position of positions || []) {
      const index = POSITION_INDEX[position];
      if (index !== undefined) mask |= 1 << index;
    }
    return mask;
  }

  function rawTeamScore(players) {
    let ppg = 0;
    let rpg = 0;
    let apg = 0;
    let spg = 0;
    let bpg = 0;
    let spgCount = 0;
    let bpgCount = 0;

    for (const player of players || []) {
      ppg += finiteNumber(player.ppg);
      rpg += finiteNumber(player.rpg);
      apg += finiteNumber(player.apg);
      const steals = positiveNumber(player.spg);
      const blocks = positiveNumber(player.bpg);
      if (steals > 0) {
        spg += steals;
        spgCount += 1;
      }
      if (blocks > 0) {
        bpg += blocks;
        bpgCount += 1;
      }
    }

    const adjustedSpg = spgCount ? (spg * 5) / spgCount : 0;
    const adjustedBpg = bpgCount ? (bpg * 5) / bpgCount : 0;
    return (
      100 *
      ((0.46 * ppg) / 133.4 +
        (0.25 * rpg) / 39.7 +
        (0.18 * apg) / 29.3 +
        (0.07 * adjustedSpg) / 6.1 +
        (0.04 * adjustedBpg) / 3.2)
    );
  }

  function projectedWins(score) {
    return Math.round(
      82 *
        Math.pow(
          Math.min(Math.max(score, 0) / RECORD_SCORE_CAP, 1),
          1.15,
        ),
    );
  }

  function calculateTeamResult(players) {
    const raw = rawTeamScore(players);
    const score = roundOne(raw);
    const wins = projectedWins(score);
    return { raw, score, wins, losses: 82 - wins, possible82: wins === 82 };
  }

  function meaningfulRateAdvantage(
    betterRate,
    betterTrials,
    worseRate,
    worseTrials,
  ) {
    const difference = betterRate - worseRate;
    if (difference <= 0) return false;
    const leftTrials = Math.max(1, finiteNumber(betterTrials));
    const rightTrials = Math.max(1, finiteNumber(worseTrials));
    const standardError = Math.sqrt(
      (betterRate * (1 - betterRate)) / leftTrials +
        (worseRate * (1 - worseRate)) / rightTrials,
    );
    return (
      difference >=
      Math.max(MIN_PATH_ADVANTAGE, PATH_CONFIDENCE_Z * standardError)
    );
  }

  function rolloutRowValue(row) {
    return (
      COEFF_PPG * row.ppg +
      COEFF_RPG * row.rpg +
      COEFF_APG * row.apg +
      COEFF_SPG[5] * row.spg +
      COEFF_BPG[5] * row.bpg
    );
  }

  // Scores one possible sequence of future server-dealt cells. The search is
  // exact over the strongest few candidates at every open position; limiting
  // each position keeps first-round forecasts fast enough for the live UI.
  function bestRolloutSequenceRaw(
    fixedRows,
    occupied,
    futurePools,
    rowsPerPosition = ROLLOUT_ROWS_PER_POSITION,
  ) {
    if (!futurePools.length) return rawTeamScore(fixedRows);
    const usedNames = new Set(fixedRows.map((row) => row.player));
    const picked = [...fixedRows];
    let bestRaw = Number.NEGATIVE_INFINITY;

    const visit = (round, mask) => {
      if (round === futurePools.length) {
        bestRaw = Math.max(bestRaw, rawTeamScore(picked));
        return;
      }
      const pool = futurePools[round] || [];
      const candidates = [];
      const seen = new Set();
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (mask & bit) continue;
        const strongest = pool
          .filter(
            (row) =>
              row.posMask & bit && !usedNames.has(row.player),
          )
          .sort((left, right) => rolloutRowValue(right) - rolloutRowValue(left))
          .slice(0, rowsPerPosition);
        for (const row of strongest) {
          const key = `${row.key}@${positionIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ row, bit });
        }
      }
      for (const candidate of candidates) {
        usedNames.add(candidate.row.player);
        picked.push(candidate.row);
        visit(round + 1, mask | candidate.bit);
        picked.pop();
        usedNames.delete(candidate.row.player);
      }
    };

    visit(0, occupied);
    return Number.isFinite(bestRaw) ? bestRaw : null;
  }

  function normalizeDataset(rawRows) {
    const rows = [];
    const nameToId = new Map();
    const names = [];
    const sourceRows = Array.isArray(rawRows)
      ? rawRows
      : Array.isArray(rawRows?.players)
        ? rawRows.players
        : [];

    for (const source of sourceRows) {
      const player = source?.player || source?.name;
      const stats = source?.stats || source;
      if (!source || !ERAS.has(source.era) || !player || !source.team)
        continue;
      const positions = (
        Array.isArray(source.positions) ? source.positions : [source.pos]
      ).filter((position) => POSITION_INDEX[position] !== undefined);
      const posMask = positionMask(positions);
      if (!posMask) continue;

      let nameId = nameToId.get(player);
      if (nameId === undefined) {
        nameId = names.length;
        nameToId.set(player, nameId);
        names.push(player);
      }

      const spg = positiveNumber(stats.spg);
      const bpg = positiveNumber(stats.bpg);
      rows.push({
        player: String(player),
        team: String(source.team),
        era: String(source.era),
        positions: [...new Set(positions)],
        posMask,
        ppg: finiteNumber(stats.ppg),
        rpg: finiteNumber(stats.rpg),
        apg: finiteNumber(stats.apg),
        spg,
        bpg,
        sig: (spg > 0 ? 1 : 0) | (bpg > 0 ? 2 : 0),
        nameId,
        id: source.id || `${player}_${source.team}_${source.era}`,
        key: `${player}|${source.team}|${source.era}`,
      });
    }

    return { rows, nameToId, names };
  }

  class ExactCeilingOptimizer {
    constructor(rows, names) {
      this.rows = rows;
      this.names = names;
      this.nameCount = names.length;
      this.scenarios = [];
      this.cache = new Map();
      this.relevantNames = new Set();
      this.buildIndex();
    }

    buildIndex() {
      const actionCount = 20; // five positions x four defense-presence signatures
      const denseValues = new Float64Array(this.nameCount * actionCount);
      const denseRows = new Int32Array(this.nameCount * actionCount);

      for (let ks = 0; ks <= 5; ks += 1) {
        for (let kb = 0; kb <= 5; kb += 1) {
          denseValues.fill(Number.NEGATIVE_INFINITY);
          denseRows.fill(-1);

          for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex += 1) {
            const row = this.rows[rowIndex];
            const value =
              COEFF_PPG * row.ppg +
              COEFF_RPG * row.rpg +
              COEFF_APG * row.apg +
              COEFF_SPG[ks] * row.spg +
              COEFF_BPG[kb] * row.bpg;

            for (let position = 0; position < 5; position += 1) {
              if (!(row.posMask & (1 << position))) continue;
              const action = position * 4 + row.sig;
              const denseIndex = row.nameId * actionCount + action;
              if (
                value > denseValues[denseIndex] + EPSILON ||
                (Math.abs(value - denseValues[denseIndex]) <= EPSILON &&
                  (denseRows[denseIndex] < 0 ||
                    rowIndex < denseRows[denseIndex]))
              ) {
                denseValues[denseIndex] = value;
                denseRows[denseIndex] = rowIndex;
              }
            }
          }

          const topByAction = Array.from({ length: actionCount }, () => []);
          const union = new Set();
          for (let action = 0; action < actionCount; action += 1) {
            const ranked = [];
            for (let nameId = 0; nameId < this.nameCount; nameId += 1) {
              const value = denseValues[nameId * actionCount + action];
              if (Number.isFinite(value)) ranked.push(nameId);
            }
            ranked.sort((left, right) => {
              const difference =
                denseValues[right * actionCount + action] -
                denseValues[left * actionCount + action];
              return Math.abs(difference) > EPSILON
                ? difference
                : this.names[left].localeCompare(this.names[right]);
            });
            topByAction[action] = ranked.slice(0, 5);
            for (const nameId of topByAction[action]) {
              union.add(nameId);
              this.relevantNames.add(nameId);
            }
          }

          const localNames = [...union].sort((left, right) => left - right);
          const globalToLocal = new Int16Array(this.nameCount);
          globalToLocal.fill(-1);
          const values = new Float64Array(localNames.length * actionCount);
          values.fill(Number.NEGATIVE_INFINITY);
          const rowIndices = new Int32Array(localNames.length * actionCount);
          rowIndices.fill(-1);

          localNames.forEach((nameId, localIndex) => {
            globalToLocal[nameId] = localIndex;
            for (let action = 0; action < actionCount; action += 1) {
              const sourceIndex = nameId * actionCount + action;
              const targetIndex = localIndex * actionCount + action;
              values[targetIndex] = denseValues[sourceIndex];
              rowIndices[targetIndex] = denseRows[sourceIndex];
            }
          });

          this.scenarios.push({
            ks,
            kb,
            cs: COEFF_SPG[ks],
            cb: COEFF_BPG[kb],
            localNames,
            globalToLocal,
            values,
            rowIndices,
            topByAction,
          });
        }
      }
    }

    clearCache() {
      this.cache.clear();
    }

    cacheKey(fixedRows, openMask, spgCount, bpgCount) {
      const excluded = [];
      for (const row of fixedRows) {
        if (this.relevantNames.has(row.nameId)) excluded.push(row.nameId);
      }
      excluded.sort((left, right) => left - right);
      return `${openMask}|${spgCount}|${bpgCount}|${excluded.join(".")}`;
    }

    candidateLocals(scenario, excluded, openMask, remaining) {
      const candidates = new Set();
      for (let position = 0; position < 5; position += 1) {
        if (!(openMask & (1 << position))) continue;
        for (let sig = 0; sig < 4; sig += 1) {
          const action = position * 4 + sig;
          let kept = 0;
          for (const nameId of scenario.topByAction[action]) {
            if (excluded.has(nameId)) continue;
            const local = scenario.globalToLocal[nameId];
            if (local >= 0) candidates.add(local);
            kept += 1;
            if (kept >= remaining) break;
          }
        }
      }
      return [...candidates];
    }

    solveScenario(scenario, fixedRows, openMask, spgCount, bpgCount, withPath) {
      const remaining = popcount(openMask);
      const neededSpg = scenario.ks - spgCount;
      const neededBpg = scenario.kb - bpgCount;
      if (
        neededSpg < 0 ||
        neededBpg < 0 ||
        neededSpg > remaining ||
        neededBpg > remaining
      ) {
        return { value: Number.NEGATIVE_INFINITY, picks: [] };
      }

      if (remaining === 0) {
        return neededSpg === 0 && neededBpg === 0
          ? { value: 0, picks: [] }
          : { value: Number.NEGATIVE_INFINITY, picks: [] };
      }

      const excluded = new Set(fixedRows.map((row) => row.nameId));
      const candidateLocals = this.candidateLocals(
        scenario,
        excluded,
        openMask,
        remaining,
      );
      const stateCount = 32 * 6 * 6;
      const stateIndex = (mask, steals, blocks) =>
        (mask * 6 + steals) * 6 + blocks;
      let values = new Float64Array(stateCount);
      values.fill(Number.NEGATIVE_INFINITY);
      values[stateIndex(0, 0, 0)] = 0;
      let paths = withPath ? new Array(stateCount).fill(null) : null;

      for (const local of candidateLocals) {
        const nextValues = values.slice();
        const nextPaths = withPath ? paths.slice() : null;

        for (let index = 0; index < stateCount; index += 1) {
          const currentValue = values[index];
          if (!Number.isFinite(currentValue)) continue;
          const blocks = index % 6;
          const withoutBlocks = (index - blocks) / 6;
          const steals = withoutBlocks % 6;
          const usedMask = (withoutBlocks - steals) / 6;

          for (let position = 0; position < 5; position += 1) {
            const bit = 1 << position;
            if (!(openMask & bit) || usedMask & bit) continue;
            for (let sig = 0; sig < 4; sig += 1) {
              const action = position * 4 + sig;
              const actionValue = scenario.values[local * 20 + action];
              if (!Number.isFinite(actionValue)) continue;
              const nextSteals = steals + (sig & 1 ? 1 : 0);
              const nextBlocks = blocks + (sig & 2 ? 1 : 0);
              if (nextSteals > neededSpg || nextBlocks > neededBpg) continue;
              const nextIndex = stateIndex(
                usedMask | bit,
                nextSteals,
                nextBlocks,
              );
              const proposed = currentValue + actionValue;
              if (proposed > nextValues[nextIndex] + EPSILON) {
                nextValues[nextIndex] = proposed;
                if (withPath) {
                  const rowIndex = scenario.rowIndices[local * 20 + action];
                  nextPaths[nextIndex] = {
                    previous: paths[index],
                    rowIndex,
                    position,
                  };
                }
              }
            }
          }
        }

        values = nextValues;
        if (withPath) paths = nextPaths;
      }

      const terminalIndex = stateIndex(openMask, neededSpg, neededBpg);
      const terminalValue = values[terminalIndex];
      if (!withPath || !Number.isFinite(terminalValue)) {
        return { value: terminalValue, picks: [] };
      }

      const picks = [];
      for (let path = paths[terminalIndex]; path; path = path.previous) {
        if (path.rowIndex >= 0) {
          picks.push({
            row: this.rows[path.rowIndex],
            position: POSITIONS[path.position],
          });
        }
      }
      picks.reverse();
      return { value: terminalValue, picks };
    }

    completionVector(fixedRows, openMask, spgCount, bpgCount) {
      const key = this.cacheKey(fixedRows, openMask, spgCount, bpgCount);
      const cached = this.cache.get(key);
      if (cached) return cached;

      const vector = new Float64Array(this.scenarios.length);
      vector.fill(Number.NEGATIVE_INFINITY);
      this.scenarios.forEach((scenario, index) => {
        vector[index] = this.solveScenario(
          scenario,
          fixedRows,
          openMask,
          spgCount,
          bpgCount,
          false,
        ).value;
      });

      if (this.cache.size > 1600) this.cache.clear();
      this.cache.set(key, vector);
      return vector;
    }

    ceilingForMask(fixedRows, occupiedMask, withLineup = false) {
      const openMask = FULL_POSITION_MASK & ~occupiedMask;
      if (fixedRows.length + popcount(openMask) !== 5) {
        return null;
      }
      const uniqueNames = new Set(fixedRows.map((row) => row.player));
      if (uniqueNames.size !== fixedRows.length) return null;

      let fixedPpg = 0;
      let fixedRpg = 0;
      let fixedApg = 0;
      let fixedSpg = 0;
      let fixedBpg = 0;
      let spgCount = 0;
      let bpgCount = 0;
      for (const row of fixedRows) {
        fixedPpg += row.ppg;
        fixedRpg += row.rpg;
        fixedApg += row.apg;
        fixedSpg += row.spg;
        fixedBpg += row.bpg;
        if (row.spg > 0) spgCount += 1;
        if (row.bpg > 0) bpgCount += 1;
      }

      const offensiveBase =
        COEFF_PPG * fixedPpg + COEFF_RPG * fixedRpg + COEFF_APG * fixedApg;
      const vector = this.completionVector(
        fixedRows,
        openMask,
        spgCount,
        bpgCount,
      );
      let bestRaw = Number.NEGATIVE_INFINITY;
      let bestScenarioIndex = -1;
      for (let index = 0; index < this.scenarios.length; index += 1) {
        const future = vector[index];
        if (!Number.isFinite(future)) continue;
        const scenario = this.scenarios[index];
        const raw =
          offensiveBase +
          scenario.cs * fixedSpg +
          scenario.cb * fixedBpg +
          future;
        if (raw > bestRaw + EPSILON) {
          bestRaw = raw;
          bestScenarioIndex = index;
        }
      }

      if (!Number.isFinite(bestRaw)) return null;
      const score = roundOne(bestRaw);
      const wins = projectedWins(score);
      const result = {
        raw: bestRaw,
        score,
        wins,
        losses: 82 - wins,
        possible82: wins === 82,
        openMask,
        occupiedMask,
        future: [],
      };

      if (withLineup && bestScenarioIndex >= 0) {
        const scenario = this.scenarios[bestScenarioIndex];
        result.future = this.solveScenario(
          scenario,
          fixedRows,
          openMask,
          spgCount,
          bpgCount,
          true,
        ).picks;
      }
      return result;
    }

    relaxedCeiling(fixedRows, withAssignment = false) {
      const masks = new Map();
      const sorted = [...fixedRows].sort(
        (left, right) => popcount(left.posMask) - popcount(right.posMask),
      );

      const visit = (index, mask, assignment) => {
        if (index === sorted.length) {
          if (!masks.has(mask)) masks.set(mask, [...assignment]);
          return;
        }
        const row = sorted[index];
        for (let position = 0; position < 5; position += 1) {
          const bit = 1 << position;
          if (!(row.posMask & bit) || mask & bit) continue;
          assignment.push({ row, position: POSITIONS[position] });
          visit(index + 1, mask | bit, assignment);
          assignment.pop();
        }
      };
      visit(0, 0, []);

      let best = null;
      for (const [mask, assignment] of masks) {
        const result = this.ceilingForMask(fixedRows, mask, withAssignment);
        if (!result) continue;
        if (!best || result.raw > best.raw + EPSILON) {
          best = { ...result, assignment };
        }
      }
      return best;
    }
  }

  function rosterStateKey(slots) {
    return slots
      .map((row) =>
        row ? row.key || row.id || `${row.player}:${row.nameId}` : "-",
      )
      .join("\u001f");
  }

  function reachableRosterStates(entries) {
    const initial = Array(5).fill(null);
    for (const entry of entries || []) {
      const index = POSITION_INDEX[entry.position];
      if (index === undefined || initial[index]) return [];
      initial[index] = entry.row;
    }

    const queue = [{ slots: initial, moves: [] }];
    const seen = new Set([rosterStateKey(initial)]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const state = queue[cursor];
      for (let from = 0; from < 5; from += 1) {
        const moving = state.slots[from];
        if (!moving) continue;
        for (let to = 0; to < 5; to += 1) {
          if (from === to || !(moving.posMask & (1 << to))) continue;
          // Only move into the current empty slot. Occupied-position swaps can
          // mirror the lineup and make the next scan recommend the reverse
          // swap forever. Empty-slot moves follow a stable augmenting path:
          // every step opens the position needed by the following step.
          if (state.slots[to]) continue;
          const slots = [...state.slots];
          slots[to] = moving;
          slots[from] = null;
          const key = rosterStateKey(slots);
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push({
            slots,
            moves: [
              ...state.moves,
              {
                player: moving.player,
                from: POSITIONS[from],
                to: POSITIONS[to],
                swapPlayer: null,
              },
            ],
          });
        }
      }
    }
    return queue;
  }

  function shortestPlacementPlan(
    states,
    row,
    desiredMask = null,
    desiredPosition = null,
  ) {
    let best = null;
    for (const state of states || []) {
      let mask = 0;
      for (let index = 0; index < 5; index += 1) {
        if (state.slots[index]) mask |= 1 << index;
      }
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (state.slots[positionIndex] || !(row.posMask & bit)) continue;
        if (desiredPosition && POSITIONS[positionIndex] !== desiredPosition)
          continue;
        const postMask = mask | bit;
        if (desiredMask !== null && postMask !== desiredMask) continue;
        const plan = {
          position: POSITIONS[positionIndex],
          postMask,
          moves: state.moves,
          slots: state.slots,
        };
        if (
          !best ||
          plan.moves.length < best.moves.length ||
          (plan.moves.length === best.moves.length &&
            POSITION_INDEX[plan.position] < POSITION_INDEX[best.position])
        ) {
          best = plan;
        }
      }
    }
    return best;
  }

  function movePlanUpgradesOccupiedPosition(entries, row, plan) {
    if (!plan?.moves?.length) return true;
    const incumbent = (entries || []).find(
      (entry) => entry.position === plan.position,
    )?.row;
    if (!incumbent) return false;
    return rawTeamScore([row]) > rawTeamScore([incumbent]) + EPSILON;
  }

  function permittedPlacement(row, entries, fixedRows, optimizer) {
    const initialState = reachableRosterStates(entries)[0];
    if (!initialState) return null;

    // An open compatible slot never needs a reshuffle. Position changes are
    // reserved for cases where the new roll cannot otherwise fit.
    let best = null;
    for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
      const bit = 1 << positionIndex;
      if (initialState.slots[positionIndex] || !(row.posMask & bit)) continue;
      const postMask = occupiedMask(entries) | bit;
      const ceiling = optimizer.ceilingForMask(
        [...fixedRows, row],
        postMask,
        false,
      );
      if (!ceiling) continue;
      const candidate = {
        plan: {
          position: POSITIONS[positionIndex],
          postMask,
          moves: [],
          slots: initialState.slots,
        },
        ceiling,
      };
      if (!best || ceiling.raw > best.ceiling.raw + EPSILON) best = candidate;
    }
    if (best) return best;

    // If every compatible slot is occupied, allow a reshuffle only when the
    // current-roll player is genuinely stronger than the player whose slot it
    // takes. This prevents speculative moves made solely for future flexibility.
    for (const state of reachableRosterStates(entries)) {
      const plan = shortestPlacementPlan([state], row);
      if (!plan || !movePlanUpgradesOccupiedPosition(entries, row, plan))
        continue;
      const ceiling = optimizer.ceilingForMask(
        [...fixedRows, row],
        plan.postMask,
        false,
      );
      if (!ceiling) continue;
      const candidate = { plan, ceiling };
      if (
        !best ||
        ceiling.raw > best.ceiling.raw + EPSILON ||
        (Math.abs(ceiling.raw - best.ceiling.raw) <= EPSILON &&
          plan.moves.length < best.plan.moves.length)
      ) {
        best = candidate;
      }
    }
    return best;
  }

  class MulberryRng {
    constructor(seed) {
      this.state = Number(seed) >>> 0;
    }

    next() {
      let value = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      value = Math.imul(value ^ (value >>> 15), 1 | value);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }

    clone() {
      const copy = new MulberryRng(0);
      copy.state = this.state;
      return copy;
    }
  }

  function buildStudioDrawIndex(players) {
    const byId = new Map();
    const squadByKey = new Map();
    const idByKey = new Map();
    for (const source of Array.isArray(players) ? players : []) {
      const name = source?.name || source?.player;
      const positions = Array.isArray(source?.positions)
        ? [...source.positions]
        : [];
      if (!source?.id || !source.team || !ERAS.has(source.era) || !name)
        continue;
      const player = {
        id: String(source.id),
        team: String(source.team),
        era: String(source.era),
        name: String(name),
        positions,
        posMask: positionMask(positions),
      };
      byId.set(player.id, player);
      idByKey.set(`${player.name}|${player.team}|${player.era}`, player.id);
      const key = `${player.team}|${player.era}`;
      if (!squadByKey.has(key)) squadByKey.set(key, []);
      squadByKey.get(key).push(player);
    }
    return {
      byId,
      squadByKey,
      idByKey,
      sortedKeys: [...squadByKey.keys()].sort(),
    };
  }

  function criticalStudioPlayerIds(index) {
    const critical = new Set();
    for (const squad of index.squadByKey.values()) {
      for (let openMask = 1; openMask <= FULL_POSITION_MASK; openMask += 1) {
        const legal = squad.filter((player) => player.posMask & openMask);
        if (legal.length > 4) continue;
        for (const player of legal) critical.add(player.id);
      }
    }
    return critical;
  }

  class StudioShadowSession {
    constructor(payload, players) {
      this.sessionId = payload.session_id;
      this.seed = Number(payload.seed) >>> 0;
      this.slots = payload.slots.map((slot) => ({
        id: String(slot.id),
        positions: [...slot.positions],
      }));
      this.respinBudget = { ...payload.respin_budget };
      this.index = buildStudioDrawIndex(players);
      this.rng = new MulberryRng(this.seed);
      this.openSlots = [...this.slots];
      this.placed = new Set();
      this.respins = [];
      this.step = 0;
      this.current = null;
      this.drawnStep = -1;
    }

    clone() {
      const copy = Object.create(StudioShadowSession.prototype);
      copy.sessionId = this.sessionId;
      copy.seed = this.seed;
      copy.slots = this.slots;
      copy.respinBudget = this.respinBudget;
      copy.index = this.index;
      copy.rng = this.rng.clone();
      copy.openSlots = [...this.openSlots];
      copy.placed = new Set(this.placed);
      copy.respins = [...this.respins];
      copy.step = this.step;
      copy.current = this.current;
      copy.drawnStep = this.drawnStep;
      return copy;
    }

    isPlayerLegalForSlot(player, slot) {
      return slot.positions.some((position) =>
        player.positions.includes(position),
      );
    }

    drawSpin(options = {}) {
      let keys = this.index.sortedKeys;
      if (
        options.lockedTeam ||
        options.lockedEra ||
        options.excludedTeam ||
        options.excludedEra ||
        options.excludeKey
      ) {
        keys = keys.filter((key) => {
          const [team, era] = key.split("|");
          return (
            (!options.lockedTeam || team === options.lockedTeam) &&
            (!options.lockedEra || era === options.lockedEra) &&
            (!options.excludedTeam || team !== options.excludedTeam) &&
            (!options.excludedEra || era !== options.excludedEra) &&
            (!options.excludeKey || key !== options.excludeKey)
          );
        });
      }
      const shuffled = [...keys];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.rng.next() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex],
          shuffled[index],
        ];
      }
      for (const key of shuffled) {
        const squad = this.index.squadByKey.get(key) || [];
        const legal = squad.some(
          (player) =>
            !this.placed.has(player.id) &&
            this.openSlots.some((slot) =>
              this.isPlayerLegalForSlot(player, slot),
            ),
        );
        if (!legal) continue;
        const [team, era] = key.split("|");
        return { team, era, squad };
      }
      return null;
    }

    nextSpin() {
      if (this.drawnStep === this.step && this.current) return this.current;
      const draw = this.drawSpin();
      if (!draw) return null;
      this.drawnStep = this.step;
      this.current = draw;
      return draw;
    }

    remainingRespins(scope) {
      return (
        finiteNumber(this.respinBudget[scope]) -
        this.respins.filter((respin) => respin.scope === scope).length
      );
    }

    respin(scope) {
      if (!this.current || this.remainingRespins(scope) <= 0) return null;
      const options =
        scope === "team"
          ? { lockedEra: this.current.era, excludedTeam: this.current.team }
          : { lockedTeam: this.current.team, excludedEra: this.current.era };
      this.respins.push({ scope, at_slot: this.step });
      const draw = this.drawSpin(options);
      if (!draw) return null;
      this.current = draw;
      return draw;
    }

    resolvePlayerId(row) {
      return (
        this.index.idByKey.get(`${row.player}|${row.team}|${row.era}`) || null
      );
    }

    recordPick(requestedSlotId, playerId) {
      const player = this.index.byId.get(playerId);
      if (!player || this.placed.has(playerId) || !this.openSlots.length)
        return false;
      const compatible = (slot) => this.isPlayerLegalForSlot(player, slot);
      const slot =
        this.openSlots.find(
          (candidate) =>
            candidate.id === requestedSlotId && compatible(candidate),
        ) ||
        this.openSlots.find(compatible) ||
        this.openSlots[0];
      this.placed.add(playerId);
      this.openSlots = this.openSlots.filter(
        (candidate) => candidate.id !== slot.id,
      );
      this.step += 1;
      this.current = null;
      return true;
    }
  }

  // Use the very same planner definitions in the worker, not a second model
  // or a smaller search. Kept pure so parity can be tested outside the browser.
  function livePlannerWorkerSource() {
    const constants = { POSITIONS, POSITION_INDEX, FULL_POSITION_MASK, EPSILON,
      RECORD_SCORE_CAP, COEFF_PPG, COEFF_RPG, COEFF_APG, COEFF_SPG, COEFF_BPG };
    const definitions = [finiteNumber, positiveNumber, roundOne, rawTeamScore,
      projectedWins, calculateTeamResult, rolloutRowValue, rosterStateKey,
      reachableRosterStates, shortestPlacementPlan, movePlanUpgradesOccupiedPosition,
      extendRosterFamily, rosterFamily, FixedSlotDraftPlanner, LiveDraftPlanner];
    return `"use strict";\n${Object.entries(constants).map(([key, value]) =>
      `const ${key} = ${JSON.stringify(value)};`).join("\n")}\n` +
      definitions.map((definition) => definition.toString()).join("\n") + `
      self.onmessage = ({ data }) => {
        try {
          const { pools, entries, rows, cell, retries } = data;
          self.postMessage({ advice: new LiveDraftPlanner(pools, entries).advise(rows, cell, retries) });
        } catch (error) {
          self.postMessage({ error: String(error?.message || error) });
        }
      };`;
  }

  function clampPanelPosition(position, viewportWidth, viewportHeight, width, height) {
    const clamp = (value, maximum) => Math.min(Math.max(8, finiteNumber(value)), Math.max(8, maximum));
    return { x: clamp(position.x, viewportWidth - width - 8),
      y: clamp(position.y, viewportHeight - height - 8) };
  }

  const Core = {
    POSITIONS,
    TARGET_SCORE,
    normalizeDataset,
    calculateTeamResult,
    projectedWins,
    rawTeamScore,
    meaningfulRateAdvantage,
    bestRolloutSequenceRaw,
    stratifiedFutureKeys,
    rolloutCandidateShortlist,
    roundOne,
    matchupResult,
    opponentFromSessionPayload,
    resolveSquadRows,
    normalizeDealtCell,
    bestLivePick,
    livePriorPools,
    LiveDraftPlanner,
    livePlannerWorkerSource,
    clampPanelPosition,
    FixedSlotDraftPlanner,
    rosterFamily,
    extendRosterFamily,
    positionMask,
    reachableRosterStates,
    shortestPlacementPlan,
    controlPosition,
    readCourtRoster,
    placementPlanIsLegal,
    lineupMatchesSnapshot,
    movePlanUpgradesOccupiedPosition,
    MulberryRng,
    buildStudioDrawIndex,
    criticalStudioPlayerIds,
    StudioShadowSession,
    ExactCeilingOptimizer,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Core;
  }
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!/(^|\.)82-0\.com$/i.test(location.hostname)) return;

  let observedDatasetUrl = null;
  const datasetUrlWaiters = new Set();
  const studioDatasetUrl = (value) => {
    try {
      const url = new URL(
        typeof value === "string" ? value : value?.url || "",
        location.href,
      );
      return url.hostname === "storage.googleapis.com" &&
        /\/com\.vaultystudios\.eightytwoand0\/(?:nba\/)?players\/[^/]+\.json$/i.test(
          url.pathname,
        )
        ? url.href
        : null;
    } catch (_) {
      return null;
    }
  };

  const nativeFetch = window.fetch.bind(window);
  let rowsLoadInProgress = false;
  function discoverDatasetUrl(value) {
    const url = studioDatasetUrl(value);
    if (!url) return;
    observedDatasetUrl = url;
    for (const resolve of datasetUrlWaiters) resolve(url);
    datasetUrlWaiters.clear();
    if (!rowsLoadInProgress && !runtime.liveDataMode && !runtime.dataReady)
      startLoadingRows();
  }
  window.fetch = (...args) => {
    discoverDatasetUrl(args[0]);
    const request = nativeFetch(...args);
    request
      .then((response) => {
        if (!response.ok) return;
        const isSeededStart =
          /\/game-session\/api\/v(?:1|2)\/session\/start(?:$|[?#])/i.test(
            response.url,
          );
        const isDealtStart =
          /\/game-session\/api\/v(?:3|4)\/session\/start(?:$|[?#])/i.test(
            response.url,
          );
        const isDealtSpin =
          /\/game-session\/api\/v(?:3|4)\/session\/spin(?:$|[?#])/i.test(
            response.url,
          );
        let isVaultyApi = false;
        try {
          isVaultyApi =
            new URL(response.url).hostname === "api.vaultystudios.com";
        } catch (_) {}
        if (!isSeededStart && !isDealtStart && !isDealtSpin && !isVaultyApi)
          return;
        response
          .clone()
          .json()
          .then((payload) => {
            captureOfficialResult(payload);
            const isV4 = /\/api\/v4\//i.test(response.url);
            if (isDealtSpin) captureDealtSpin(payload, isV4);
            else if (isDealtStart) captureDealtSession(payload, isV4);
            else if (isSeededStart)
              captureStudioSession(payload, observedDatasetUrl);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return request;
  };

  function waitForStudioDatasetUrl(timeoutMs = DATASET_WAIT_MS) {
    if (observedDatasetUrl) return Promise.resolve(observedDatasetUrl);
    return new Promise((resolve) => {
      const finish = (datasetUrl) => {
        window.clearTimeout(timer);
        datasetUrlWaiters.delete(finish);
        resolve(datasetUrl);
      };
      const timer = window.setTimeout(() => {
        datasetUrlWaiters.delete(finish);
        resolve(null);
      }, timeoutMs);
      datasetUrlWaiters.add(finish);
    });
  }

  const runtime = {
    dataReady: false,
    liveDataMode: false,
    liveSources: new Map(),
    loadError: null,
    rows: [],
    names: [],
    nameToId: new Map(),
    namesSet: new Set(),
    byCell: new Map(),
    byKey: new Map(),
    byId: new Map(),
    rowsByName: new Map(),
    teams: new Set(),
    optimizer: null,
    tracked: new Map(),
    lastOffers: new Map(),
    recentOffers: new Map(),
    selectedRow: null,
    pendingPick: null,
    lastCell: null,
    lastAdvice: null,
    lastAdviceSignature: "",
    lastAnalysisKey: "",
    lastAnalysis: null,
    analysisInProgressKey: "",
    analysisGeneration: 0,
    liveAnalysisJob: null,
    liveWorkerSource: null,
    popupWindow: null,
    popupHost: null,
    popupPoll: 0,
    persistedPicks: new Map(),
    pickOrder: 0,
    emptyTraySince: 0,
    sessionPayload: null,
    dealtSessionId: null,
    dealtCell: null,
    liveReel: null,
    shadowSession: null,
    shadowReady: false,
    shadowSynced: false,
    shadowError: null,
    shadowPendingCell: null,
    shadowPendingFrom: null,
    criticalStudioIds: new Set(),
    scanTimer: 0,
    scanSerial: 0,
    idleRecoveryScans: 0,
    resultMismatchCandidate: null,
    officialResult: null,
    oneVsOneOpponent: null,
    opponentPlayerIds: new Set(),
    currentVisibleRows: [],
    resultRecorded: false,
    modelMismatch: safeSessionGet(MISMATCH_KEY) === "1",
    mode: safeSessionGet(MODE_KEY) || "classic",
  };

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  }

  function safeSessionRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function captureOfficialResult(payload) {
    const roots = [payload, payload?.result, payload?.data].filter(Boolean);
    for (const root of roots) {
      const display = root?.score_display;
      if (!display || typeof display !== "object") continue;
      const values = display.values || display.detail || display;
      const wins = Number(values?.wins);
      const losses = Number(values?.losses);
      if (
        !Number.isInteger(wins) ||
        !Number.isInteger(losses) ||
        wins < 0 ||
        losses < 0 ||
        wins + losses !== 82
      )
        continue;
      const score = Number(root?.score);
      runtime.officialResult = {
        wins,
        losses,
        score: Number.isFinite(score) ? score : null,
      };
      if (document.body) scheduleScan(0);
      return;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readUiState() {
    try {
      return {
        enabled: true,
        collapsed: false,
        details: false,
        hidden: false,
        position: null,
        ...JSON.parse(localStorage.getItem(UI_KEY) || "{}"),
      };
    } catch (_) {
      return {
        enabled: true,
        collapsed: false,
        details: false,
        hidden: false,
        position: null,
      };
    }
  }

  function writeUiState(next) {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function readResultHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeResultHistory(history) {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(history.slice(-HISTORY_LIMIT)),
      );
    } catch (_) {}
  }

  function recordCompletedGame(result, score) {
    if (runtime.resultRecorded || !result) return readResultHistory();
    const sessionId =
      runtime.dealtSessionId || runtime.sessionPayload?.session_id || null;
    const pickSignature = [...runtime.tracked.values()]
      .map((tracked) => tracked.row.key)
      .sort()
      .join(";");
    const id =
      sessionId ||
      `${runtime.mode}:${result.wins}:${Number.isFinite(score) ? score : "-"}:${hashText(pickSignature)}`;
    const history = readResultHistory();
    if (!history.some((entry) => entry.id === id)) {
      history.push({
        id,
        at: Date.now(),
        version: VERSION,
        mode: runtime.mode,
        wins: result.wins,
        score: Number.isFinite(score) ? score : null,
      });
      writeResultHistory(history);
    }
    runtime.resultRecorded = true;
    return history.slice(-HISTORY_LIMIT);
  }

  function resultHistorySummary(history) {
    const comparable = history.filter(
      (entry) =>
        entry.version === VERSION &&
        entry.mode === runtime.mode &&
        Number.isFinite(entry.wins),
    );
    if (!comparable.length) return "";
    const average =
      comparable.reduce((sum, entry) => sum + entry.wins, 0) /
      comparable.length;
    const best = Math.max(...comparable.map((entry) => entry.wins));
    return `Local ${modeLabel()} v${VERSION}: ${comparable.length} game${comparable.length === 1 ? "" : "s"} · ${average.toFixed(1)} average wins · ${best} best`;
  }

  function directText(element) {
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.getClientRects().length > 0
    );
  }

  function getPanel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = PANEL_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all:initial; position:fixed; right:10px; bottom:12px; z-index:2147483646; color-scheme:dark; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        #card { width:min(292px,calc(100vw - 20px)); color:#e5edf6; background:rgba(5,12,23,.965); border:1px solid #26364c; border-radius:14px; box-shadow:0 14px 38px rgba(0,0,0,.55); font:12px/1.35 system-ui,-apple-system,sans-serif; overflow:hidden; backdrop-filter:blur(12px); }
        #card.hidden { width:auto; border-radius:999px; }
        #card.disabled { width:auto; border-radius:999px; border-color:#374151; }
        header { height:34px; padding:0 6px 0 9px; display:flex; align-items:center; gap:3px; border-bottom:1px solid #1b293b; user-select:none; cursor:grab; touch-action:none; }
        header.dragging { cursor:grabbing; }
        #card.detached { width:auto; border-radius:999px; }
        #card.detached main, #card.detached .mode, #card.detached .logo, #card.detached #collapse, #card.detached #hide { display:none; }
        #card.detached header { border:0; }
        #card.hidden header { border:0; padding:0 6px 0 10px; }
        #card.disabled header { border:0; padding:0 6px 0 10px; }
        #card.disabled main,
        #card.disabled .logo,
        #card.disabled .mode,
        #card.disabled #collapse,
        #card.disabled #hide { display:none; }
        #card.disabled .title { color:#94a3b8; }
        #card.disabled #power { color:#4ade80; background:#10271c; }
        .logo { font-size:14px; }
        .title { font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:#9fb0c4; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .mode { color:#64748b; font-size:9px; font-weight:800; }
        .icon { border:0; background:transparent; color:#7f93aa; width:23px; height:23px; flex:0 0 23px; border-radius:7px; cursor:pointer; padding:0; }
        .icon:hover { color:#fff; background:#1d2a3c; }
        main { padding:10px; max-height:calc(100vh - 60px); overflow:auto; }
        #window-note { color:#fcd34d; font-size:10px; padding:0 10px 7px; }
        #window-note:empty { display:none; }
        #card.collapsed main { display:none; }
        .status { display:flex; align-items:center; gap:7px; margin-bottom:7px; color:#aab8c8; font-size:10px; }
        .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--status,#38bdf8); box-shadow:0 0 9px var(--status,#38bdf8); }
        .action { --action:#38bdf8; border:1px solid color-mix(in srgb,var(--action) 55%,#172337); background:color-mix(in srgb,var(--action) 10%,#07101e); border-radius:10px; padding:9px 10px; }
        .eyebrow { color:var(--action); font-size:9px; font-weight:900; letter-spacing:.11em; text-transform:uppercase; }
        .primary { margin-top:2px; display:flex; align-items:baseline; gap:6px; min-width:0; }
        .name { font-size:16px; line-height:1.12; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .arrow { color:#73869c; font-weight:700; }
        .position { color:#7dd3fc; font-size:15px; font-weight:900; }
        .sub { color:#9eafc2; font-size:10px; margin-top:4px; }
        .metrics { display:grid; grid-template-columns:1fr auto; gap:3px 8px; margin-top:8px; padding-top:7px; border-top:1px solid #1a2a3d; color:#7f93aa; font-size:10px; }
        .metrics strong { color:#d9e5f2; text-align:right; }
        #card:not(.details-open) .metrics,
        #card:not(.details-open) .fallback { display:none; }
        .details-toggle { width:100%; margin-top:7px; border:0; background:transparent; color:#6f8298; font-size:10px; padding:3px; cursor:pointer; }
        .details-toggle:hover { color:#c9d7e6; }
        .details { margin-top:8px; padding-top:8px; border-top:1px solid #182538; color:#8ea0b4; font-size:10px; }
        .row { display:flex; justify-content:space-between; gap:8px; padding:3px 0; }
        .row strong { color:#d3deea; text-align:right; }
        .route { margin-top:7px; padding-top:7px; border-top:1px solid #182538; }
        .route-title { margin-bottom:3px; color:#d3deea; font-weight:800; }
        .route-step { display:grid; grid-template-columns:20px 1fr; gap:5px; padding:2px 0; }
        .route-step span { color:#64748b; font-weight:800; }
        .route-step strong { min-width:0; color:#b8c6d6; font-weight:600; overflow-wrap:anywhere; }
        .fallback { margin-top:7px; padding:6px 7px; border-radius:7px; background:#0c1726; color:#9aacbf; }
        .fallback strong { color:#e7eef7; }
        .filter-hint { margin-top:7px; padding:6px 7px; border-radius:7px; background:#17233a; color:#bfdbfe; }
        .legend { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; color:#60748c; font-size:9px; }
        .swatch::before { content:''; display:inline-block; width:6px; height:6px; border-radius:2px; margin-right:3px; background:var(--c); }
        .loading { padding:5px 2px; color:#93a4b8; }
        .analyzing-dots { display:inline-flex; gap:3px; margin-left:5px; vertical-align:middle; }
        .analyzing-dots i { width:4px; height:4px; border-radius:50%; background:#38bdf8; animation:analyzing-dot 1s ease-in-out infinite; }
        .analyzing-dots i:nth-child(2) { animation-delay:.16s; }
        .analyzing-dots i:nth-child(3) { animation-delay:.32s; }
        @keyframes analyzing-dot { 0%,70%,100% { opacity:.25; transform:translateY(0); } 35% { opacity:1; transform:translateY(-2px); } }
        .error { color:#fca5a5; }
        @media (max-width:767px) {
          #card { width:min(238px,calc(100vw - 16px)); }
          :host { right:8px; bottom:calc(88px + env(safe-area-inset-bottom)); }
          header { height:30px; }
          .mode { display:none; }
          main { padding:6px; }
          .status { margin-bottom:3px; font-size:9px; line-height:1.15; }
          .action { padding:5px 7px; }
          .primary { margin-top:0; }
          .name { font-size:14px; }
          .position { font-size:13px; }
          #card:not(.details-open) .sub { display:none; }
          .details-toggle { margin-top:2px; padding:1px; }
        }
        @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
      </style>
      <div id="card"><header><span class="logo">🏀</span><span class="title">82-0 Coach</span><span class="mode"></span><button class="icon" id="power" title="Turn coach off">⏻</button><button class="icon" id="home" title="Return coach to its default corner">↩</button><button class="icon" id="popout" title="Open coach in a separate window">↗</button><button class="icon" id="collapse" title="Collapse">—</button><button class="icon" id="hide" title="Hide (Alt+A restores)">×</button></header><main id="content" role="status" aria-live="polite" aria-atomic="true"></main><div id="window-note" role="status"></div></div>
    `;
    document.body.appendChild(host);

    bindPanelControls(host);
    syncPanelState();
    applyPanelPosition(host, readUiState().position);
    bindPanelDragging(host);
    window.addEventListener("resize", () => applyPanelPosition(host, readUiState().position));
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => applyPanelPosition(host, readUiState().position)).observe(host);
    }
    return host;
  }

  function syncPanelState() {
    const state = readUiState();
    for (const host of [document.getElementById(PANEL_ID), runtime.popupHost]) {
      if (!host) continue;
      const shadow = host.shadowRoot;
      const detached = host === document.getElementById(PANEL_ID) && Boolean(runtime.popupHost);
      const card = shadow.getElementById("card");
      for (const [name, value] of Object.entries({ collapsed: state.collapsed,
        hidden: state.hidden, disabled: !state.enabled, "details-open": state.details, detached }))
        card.classList.toggle(name, value);
      shadow.querySelector(".title").textContent = !state.enabled ? "Coach off" : detached ? "Coach window" : "82-0 Coach";
      shadow.querySelector(".mode").textContent = modeLabel();
      shadow.getElementById("power").title = state.enabled ? "Turn coach off" : "Turn coach on";
      shadow.getElementById("collapse").textContent = state.collapsed ? "+" : "—";
      shadow.getElementById("home").title = runtime.popupHost ? "Dock coach back in the default corner" : "Return coach to its default corner";
      for (const button of shadow.querySelectorAll("header button"))
        button.setAttribute("aria-label", button.title);
    }
  }

  function bindPanelControls(host) {
    const shadow = host.shadowRoot;
    shadow.getElementById("collapse").onclick = () => {
      const current = readUiState();
      current.collapsed = !current.collapsed;
      current.hidden = false;
      writeUiState(current);
      syncPanelState();
    };
    shadow.getElementById("hide").onclick = () => {
      const current = readUiState();
      current.hidden = !current.hidden;
      current.collapsed = current.hidden ? true : current.collapsed;
      writeUiState(current);
      syncPanelState();
    };
    shadow.getElementById("power").onclick = () => {
      const current = readUiState();
      current.enabled = !current.enabled;
      current.hidden = false;
      current.collapsed = false;
      writeUiState(current);
      syncPanelState();
      clearHighlights();
      runtime.lastAdviceSignature = "";
      if (current.enabled && runtime.lastAnalysis?.error) {
        runtime.lastAnalysis = null;
        runtime.lastAnalysisKey = "";
      }
      if (!current.enabled) {
        cancelLiveAnalysis();
        runtime.analysisInProgressKey = "";
      }
      if (current.enabled) scheduleScan(0);
    };
    shadow.getElementById("home").onclick = () => {
      closeCoachWindow();
      writeUiState({ ...readUiState(), position: null, hidden: false, collapsed: false });
      applyPanelPosition(getPanel(), null);
      syncPanelState();
    };
    shadow.getElementById("popout").onclick = openCoachWindow;
  }

  function applyPanelPosition(host, position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      for (const property of ["left", "top", "right", "bottom"]) host.style.removeProperty(property);
      return;
    }
    const rect = host.getBoundingClientRect();
    const clamped = clampPanelPosition(position, window.innerWidth, window.innerHeight, rect.width, rect.height);
    Object.assign(host.style, { left: `${clamped.x}px`, top: `${clamped.y}px`, right: "auto", bottom: "auto" });
  }

  function bindPanelDragging(host) {
    const header = host.shadowRoot.querySelector("header");
    let drag = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
      header.classList.add("dragging");
      event.preventDefault();
    });
    header.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      applyPanelPosition(host, { x: event.clientX - drag.x, y: event.clientY - drag.y });
    });
    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const rect = host.getBoundingClientRect();
      writeUiState({ ...readUiState(), position: { x: rect.left, y: rect.top } });
      drag = null;
      header.classList.remove("dragging");
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
    };
    header.addEventListener("pointerup", finish);
    header.addEventListener("pointercancel", finish);
    header.addEventListener("lostpointercapture", finish);
  }

  function closeCoachWindow() {
    const popup = runtime.popupWindow;
    runtime.popupWindow = null;
    runtime.popupHost = null;
    clearInterval(runtime.popupPoll);
    runtime.popupPoll = 0;
    if (popup && !popup.closed) {
      try { if (popup.location.href === "about:blank") popup.close(); } catch (_) {}
    }
    syncPanelState();
  }

  function openCoachWindow() {
    const host = getPanel();
    const note = host.shadowRoot.getElementById("window-note");
    note.textContent = "";
    if (runtime.popupWindow && !runtime.popupWindow.closed) {
      try { runtime.popupWindow.focus(); return; } catch (_) { closeCoachWindow(); }
    }
    if (runtime.popupWindow) closeCoachWindow();
    let popup = null;
    try { popup = window.open("", "_blank", "popup,width=360,height=520,resizable=yes,scrollbars=yes"); }
    catch (_) {}
    if (!popup) {
      note.textContent = "Allow pop-ups for 82-0 to open the coach window.";
      return;
    }
    try {
      popup.document.title = "82-0 Coach";
      Object.assign(popup.document.body.style, { margin: "0", background: "#050c17", colorScheme: "dark" });
      const popupHost = popup.document.createElement("div");
      popupHost.attachShadow({ mode: "open" }).innerHTML = host.shadowRoot.innerHTML;
      const style = popup.document.createElement("style");
      style.textContent = ":host {position:static;display:block;} #card {width:100%;border:0;border-radius:0;backdrop-filter:none;} header {cursor:default;} main {max-height:calc(100vh - 40px);} #popout {display:none;}";
      popupHost.shadowRoot.appendChild(style);
      popup.document.body.appendChild(popupHost);
      runtime.popupWindow = popup;
      runtime.popupHost = popupHost;
      bindPanelControls(popupHost);
      bindDetailsToggle(popupHost);
      writeUiState({ ...readUiState(), hidden: false, collapsed: false });
      const restore = () => { if (runtime.popupWindow === popup) closeCoachWindow(); };
      popup.addEventListener("pagehide", restore, { once: true });
      popup.document.addEventListener("keydown", handleKeydown, true);
      runtime.popupPoll = window.setInterval(() => {
        try { if (popup.closed || popup.location.href !== "about:blank") restore(); }
        catch (_) { restore(); }
      }, 1000);
      syncPanelState();
    } catch (_) {
      popup.close();
      closeCoachWindow();
      note.textContent = "Could not open the coach window. The page panel is still available.";
    }
  }

  function bindDetailsToggle(host) {
    const detailsButton = host.shadowRoot.getElementById("details-toggle");
    if (!detailsButton) return;
    detailsButton.onclick = () => {
      writeUiState({ ...readUiState(), details: !readUiState().details });
      runtime.lastAdviceSignature = "";
      syncPanelState();
      scheduleScan(0);
    };
  }

  function modeLabel() {
    if (runtime.mode === "hoopiq") return "HOOP IQ";
    if (runtime.mode === "1v1") return "1V1";
    return "CLASSIC";
  }

  function setMode(mode) {
    if (!["classic", "hoopiq", "1v1"].includes(mode)) return;
    runtime.mode = mode;
    safeSessionSet(MODE_KEY, mode);
  }

  function loadPersistedPicks() {
    runtime.persistedPicks.clear();
    runtime.pickOrder = 0;
    try {
      const payload = JSON.parse(safeSessionGet(PICKS_KEY) || "null");
      if (
        payload?.version !== 1 ||
        !Array.isArray(payload.picks) ||
        Date.now() - finiteNumber(payload.timestamp) > PICKS_MAX_AGE
      ) {
        safeSessionRemove(PICKS_KEY);
        return;
      }
      for (const saved of payload.picks) {
        const row = runtime.byKey.get(saved?.key);
        if (!row || POSITION_INDEX[saved.position] === undefined) continue;
        const tracked = {
          row,
          position: saved.position,
          originalPosition:
            POSITION_INDEX[saved.originalPosition] === undefined
              ? saved.position
              : saved.originalPosition,
          order: Math.max(1, Math.trunc(finiteNumber(saved.order))),
        };
        runtime.persistedPicks.set(row.player, tracked);
        runtime.pickOrder = Math.max(runtime.pickOrder, tracked.order);
      }
    } catch (_) {
      safeSessionRemove(PICKS_KEY);
    }
  }

  function persistTrackedPicks() {
    const picks = [...runtime.tracked.values()]
      .filter(
        (tracked) =>
          tracked?.row && POSITION_INDEX[tracked.position] !== undefined,
      )
      .sort(
        (left, right) => finiteNumber(left.order) - finiteNumber(right.order),
      )
      .map((tracked) => ({
        key: tracked.row.key,
        position: tracked.position,
        originalPosition: tracked.originalPosition,
        order: tracked.order,
      }));
    if (!picks.length) {
      safeSessionRemove(PICKS_KEY);
      runtime.persistedPicks.clear();
      runtime.pickOrder = 0;
      return;
    }
    safeSessionSet(
      PICKS_KEY,
      JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        mode: runtime.mode,
        picks,
      }),
    );
    runtime.persistedPicks = new Map(
      [...runtime.tracked.entries()].map(([name, tracked]) => [
        name,
        { ...tracked },
      ]),
    );
  }

  function captureDealtSession(payload, isV4 = false) {
    if (!payload?.session_id || !Array.isArray(payload.slots)) return;
    cancelLiveAnalysis();
    const sessionId = String(payload.session_id);
    const opponent = opponentFromSessionPayload(payload);
    if (opponent) setMode("1v1");
    if (runtime.dealtSessionId !== sessionId) resetRuntime(runtime.mode);
    runtime.dealtSessionId = sessionId;
    runtime.liveDataMode = isV4;
    if (isV4) {
      runtime.dataReady = true;
      runtime.loadError = null;
      restoreLiveRows();
      runtime.liveReel = payload.reel || null;
    }
    runtime.oneVsOneOpponent = opponent;
    runtime.opponentPlayerIds = opponentPlayerIds(opponent?.roster);
    runtime.dealtCell = null;
    runtime.sessionPayload = null;
    runtime.shadowSession = null;
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;
    runtime.shadowError =
      "The site now deals future rolls on the server; future cells are hidden until they are played.";
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    runtime.analysisGeneration += 1;
    if (document.body) scheduleScan(0);
  }

  function captureDealtSpin(payload, isV4 = false) {
    const cell = isV4 ? normalizeDealtCell(payload?.cell) : payload?.cell;
    if (!cell || !Number.isFinite(Number(cell.seq)) || !cell.team ||
        !ERAS.has(cell.era) || !Array.isArray(cell.squad)) return;
    cancelLiveAnalysis();
    if (isV4) {
      runtime.liveDataMode = true;
      runtime.dataReady = true;
      runtime.loadError = null;
      for (const player of cell.squad) {
        if (player.hasStats) runtime.liveSources.set(player.id, player);
      }
      installRows(normalizeDataset([...runtime.liveSources.values()]));
      for (const player of cell.squad) {
        if (player.name) runtime.namesSet.add(player.name);
      }
      try {
        localStorage.setItem(LIVE_ROWS_KEY,
          JSON.stringify([...runtime.liveSources.values()].slice(-12000)));
      } catch (_) {}
    }
    runtime.dealtCell = {
      seq: Number(cell.seq),
      team: String(cell.team),
      teamId: String(cell.teamId || cell.team),
      era: String(cell.era),
      squad: cell.squad.map((player) => ({ ...player })),
      legal: Array.isArray(cell.legal) ? [...cell.legal] : [],
      boosters: cell.boosters || null,
    };
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    runtime.analysisInProgressKey = "";
    runtime.analysisGeneration += 1;
    runtime.currentVisibleRows = [];
    if (document.body) scheduleScan(0);
  }

  async function captureStudioSession(payload, capturedDatasetUrl = null) {
    const datasetUrl = payload?.dataset_url || capturedDatasetUrl;
    if (
      !payload?.session_id ||
      !Number.isFinite(Number(payload.seed)) ||
      !datasetUrl ||
      !Array.isArray(payload.slots) ||
      payload.slots.length !== 5 ||
      !payload.slots.every(
        (slot) =>
          POSITION_INDEX[slot?.id] !== undefined &&
          Array.isArray(slot.positions) &&
          slot.positions.every(
            (position) => POSITION_INDEX[position] !== undefined,
          ),
      )
    )
      return;

    const capturedSessionId = String(payload.session_id);
    if (runtime.sessionPayload?.session_id !== capturedSessionId) {
      resetRuntime(runtime.mode);
    }
    // Deliberately omit payload.user and any authentication-adjacent response data.
    runtime.sessionPayload = {
      session_id: capturedSessionId,
      seed: Number(payload.seed) >>> 0,
      dataset_version: String(payload.dataset_version || ""),
      dataset_url: String(datasetUrl),
      slots: payload.slots.map((slot) => ({
        id: String(slot.id),
        positions: [...(slot.positions || [])],
      })),
      respin_budget: { ...payload.respin_budget },
    };
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowError = null;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;

    try {
      const response = await nativeFetch(runtime.sessionPayload.dataset_url);
      if (!response.ok)
        throw new Error(`session dataset returned ${response.status}`);
      const dataset = await response.json();
      if (runtime.sessionPayload?.session_id !== capturedSessionId) return;
      const index = buildStudioDrawIndex(dataset?.players);
      if (
        !Array.isArray(dataset?.players) ||
        index.byId.size < 10_000 ||
        index.sortedKeys.length < 150 ||
        (runtime.sessionPayload.dataset_version &&
          String(dataset.version) !== runtime.sessionPayload.dataset_version)
      ) {
        throw new Error("session dataset failed completeness checks");
      }
      runtime.shadowSession = new StudioShadowSession(
        runtime.sessionPayload,
        dataset.players,
      );
      runtime.criticalStudioIds = criticalStudioPlayerIds(
        runtime.shadowSession.index,
      );
      runtime.shadowReady = true;
      runtime.shadowError = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      if (document.body) scheduleScan(0);
    } catch (error) {
      if (runtime.sessionPayload?.session_id !== capturedSessionId) return;
      console.warn(
        "[82-0 Coach] Exact seeded retry prediction unavailable",
        error,
      );
      runtime.shadowSession = null;
      runtime.shadowReady = false;
      runtime.shadowSynced = false;
      runtime.shadowError = String(error?.message || error);
    }
  }

  function sameCell(left, right) {
    return Boolean(
      left && right && left.team === right.team && left.era === right.era,
    );
  }

  function syncShadowToCell(cell) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !shadow) return "unavailable";

    if (runtime.shadowPendingCell) {
      if (sameCell(cell, runtime.shadowPendingCell)) {
        runtime.shadowPendingCell = null;
        runtime.shadowPendingFrom = null;
        runtime.shadowSynced = true;
        runtime.shadowError = null;
        return "synced";
      }
      if (sameCell(cell, runtime.shadowPendingFrom)) return "waiting";
      runtime.shadowSynced = false;
      runtime.shadowError = `predicted ${runtime.shadowPendingCell.team} ${runtime.shadowPendingCell.era}, saw ${cell.team} ${cell.era}`;
      runtime.shadowPendingCell = null;
      runtime.shadowPendingFrom = null;
      return "mismatch";
    }

    const predicted = shadow.current || shadow.nextSpin();
    if (sameCell(cell, predicted)) {
      runtime.shadowSynced = true;
      runtime.shadowError = null;
      return "synced";
    }
    runtime.shadowSynced = false;
    runtime.shadowError = predicted
      ? `predicted ${predicted.team} ${predicted.era}, saw ${cell.team} ${cell.era}`
      : "seeded draw reached a dead end";
    return "mismatch";
  }

  function commitShadowPick(row, requestedPosition) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !shadow?.current)
      return false;
    const playerId = shadow.resolvePlayerId(row);
    if (!playerId) {
      runtime.shadowSynced = false;
      runtime.shadowError = `could not resolve ${row.player}`;
      return false;
    }
    const from = { team: shadow.current.team, era: shadow.current.era };
    if (!shadow.recordPick(requestedPosition, playerId)) {
      runtime.shadowSynced = false;
      runtime.shadowError = `could not record ${row.player}`;
      return false;
    }
    if (shadow.openSlots.length) {
      const predicted = shadow.nextSpin();
      runtime.shadowPendingFrom = from;
      runtime.shadowPendingCell = predicted
        ? { team: predicted.team, era: predicted.era }
        : null;
    }
    return true;
  }

  function commitShadowRetry(scope) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !shadow?.current)
      return;
    const from = { team: shadow.current.team, era: shadow.current.era };
    const predicted = shadow.respin(scope);
    if (!predicted) {
      runtime.shadowSynced = false;
      runtime.shadowError = `${scope} retry prediction reached a dead end`;
      return;
    }
    runtime.shadowPendingFrom = from;
    runtime.shadowPendingCell = { team: predicted.team, era: predicted.era };
  }

  function renderPanel(html, signature) {
    const host = getPanel();
    const shadow = host.shadowRoot;
    syncPanelState();
    if (runtime.lastAdviceSignature === signature) return;
    runtime.lastAdviceSignature = signature;
    shadow.getElementById("content").innerHTML = html;

    bindDetailsToggle(host);
    if (runtime.popupHost) {
      runtime.popupHost.shadowRoot.getElementById("content").innerHTML = html;
      bindDetailsToggle(runtime.popupHost);
    }
  }

  function renderLoading(message, error = false) {
    clearHighlights();
    renderPanel(
      `<div class="loading ${error ? "error" : ""}">${escapeHtml(message)}</div>`,
      `loading:${message}:${error}`,
    );
  }

  function renderAnalyzing() {
    clearHighlights();
    renderPanel(
      '<div class="loading"><span>Analyzing the roll</span><span class="analyzing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>',
      "loading:analyzing",
    );
  }

  async function loadRows() {
    const datasetUrl = await waitForStudioDatasetUrl();
    if (!datasetUrl || runtime.liveDataMode) return;
    const response = await nativeFetch(datasetUrl);
    if (!response.ok)
      throw new Error(`player dataset returned ${response.status}`);
    const data = await response.json();

    const normalized = normalizeDataset(data);
    const coveredPositions = normalized.rows.reduce(
      (mask, row) => mask | row.posMask,
      0,
    );
    const cellCount = new Set(
      normalized.rows.map((row) => `${row.team}|${row.era}`),
    ).size;
    if (
      normalized.rows.length < 10_000 ||
      normalized.names.length < 3_000 ||
      cellCount < 150 ||
      coveredPositions !== FULL_POSITION_MASK
    ) {
      throw new Error("player dataset failed completeness checks");
    }
    installRows(normalized);
    runtime.optimizer = new ExactCeilingOptimizer(runtime.rows, runtime.names);
    runtime.dataReady = true;
    runtime.loadError = null;
  }

  function restoreLiveRows() {
    if (!runtime.liveSources.size) {
      try {
        const saved = JSON.parse(localStorage.getItem(LIVE_ROWS_KEY) || "[]");
        if (Array.isArray(saved)) for (const row of saved.slice(-12000)) {
          if (row?.id && row?.hasStats) runtime.liveSources.set(row.id, row);
        }
      } catch (_) {}
    }
    installRows(normalizeDataset([...runtime.liveSources.values()]));
  }

  function livePlanningPools() {
    const pools = new Map(livePriorPools().map((pool) =>
      [`${pool.teamId}|${pool.era}`, pool]));
    for (const rows of runtime.byCell.values()) {
      const source = runtime.liveSources.get(String(rows[0]?.id));
      const teamId = String(source?.team_id || String(rows[0]?.id).split("|")[1] || "");
      if (!teamId) continue;
      pools.set(`${teamId}|${rows[0].era}`, { teamId, era: rows[0].era, rows });
    }
    const reelCells = new Set((runtime.liveReel?.teams || []).flatMap((team) =>
      (team.eras || []).map((era) => `${team.team_id}|${era}`)));
    const opponentNames = new Set(runtime.rows.filter((row) =>
      runtime.opponentPlayerIds.has(String(row.id)) ||
      runtime.opponentPlayerIds.has(String(row.id).split("|")[0]))
      .map((row) => row.player));
    return [...pools.values()].filter((pool) => !reelCells.size ||
      reelCells.has(`${pool.teamId}|${pool.era}`)).map((pool) => ({
        ...pool, rows: pool.rows.filter((row) => !opponentNames.has(row.player)),
      }));
  }

  function installRows(normalized) {
    runtime.byKey.clear();
    runtime.byId.clear();
    runtime.byCell.clear();
    runtime.rowsByName.clear();
    runtime.teams.clear();
    runtime.rows = normalized.rows;
    runtime.names = normalized.names;
    runtime.nameToId = normalized.nameToId;
    runtime.namesSet = new Set(normalized.names);

    for (const row of runtime.rows) {
      runtime.byKey.set(row.key, row);
      runtime.byId.set(String(row.id), row);
      const cell = `${row.team}|${row.era}`;
      if (!runtime.byCell.has(cell)) runtime.byCell.set(cell, []);
      runtime.byCell.get(cell).push(row);
      if (!runtime.rowsByName.has(row.player))
        runtime.rowsByName.set(row.player, []);
      runtime.rowsByName.get(row.player).push(row);
      runtime.teams.add(row.team);
    }

    loadPersistedPicks();
  }

  function getPlayerListRoot() {
    const currentCard = document.querySelector('[data-testid="player-card"]');
    if (currentCard) return currentCard.parentElement || currentCard;
    const inputs = [...document.querySelectorAll("input")];
    const search = inputs.find((input) =>
      /search/i.test(input.getAttribute("placeholder") || ""),
    );
    if (search) {
      return (
        search.closest(".space-y-3") ||
        search.parentElement?.parentElement?.parentElement ||
        null
      );
    }
    // Localized copies may not use the English "Search..." placeholder.
    const fallbackCard = [
      ...document.querySelectorAll(
        '[data-testid="player-card"],div[draggable]',
      ),
    ].find((element) => Boolean(rowFromCard(element)));
    return fallbackCard?.parentElement || null;
  }

  function rowFromCard(card) {
    if (!card) return null;
    const datasetName = card.getAttribute("data-player")?.trim();
    const paragraphs = [...card.querySelectorAll("p")];
    const name =
      (datasetName && runtime.namesSet.has(datasetName) && datasetName) ||
      paragraphs
        .map((paragraph) => paragraph.textContent.trim())
        .find((text) => runtime.namesSet.has(text));
    if (!name) return null;
    if (runtime.dealtCell) {
      const dealtRow = runtime.byKey.get(
        `${name}|${runtime.dealtCell.team}|${runtime.dealtCell.era}`,
      );
      if (dealtRow) return dealtRow;
    }
    const cellText = paragraphs
      .map((paragraph) => paragraph.textContent.trim())
      .find((text) => /\b[A-Z0-9]{2,4}\s*·\s*(?:19|20)\d0s\b/.test(text));
    if (!cellText) return null;
    const match = cellText.match(/\b([A-Z0-9]{2,4})\s*·\s*((?:19|20)\d0s)\b/);
    if (!match) return null;
    return runtime.byKey.get(`${name}|${match[1]}|${match[2]}`) || null;
  }

  function findCards() {
    const cards = [];
    for (const candidate of document.querySelectorAll(
      '[data-testid="player-card"],div[draggable]',
    )) {
      const row = rowFromCard(candidate);
      if (!row) continue;
      cards.push({
        element: candidate,
        row,
        enabled:
          candidate.getAttribute("data-selectable") !== "false" &&
          candidate.getAttribute("draggable") !== "false",
      });
    }
    return cards;
  }

  function parseCell(cards) {
    if (runtime.dealtCell && (cards.length || runtime.liveDataMode))
      return { team: runtime.dealtCell.team, era: runtime.dealtCell.era };
    if (cards.length) return { team: cards[0].row.team, era: cards[0].row.era };
    return runtime.lastCell;
  }

  function readCourtRoster(root, knownNames = new Set(), trackedNames = []) {
    const tray = root.querySelector("[data-lineup-tray]");
    const controls = new Set();
    if (tray) {
      for (const slot of tray.querySelectorAll('[role="button"]'))
        controls.add(slot);
    }
    for (const slot of root.querySelectorAll(
      'button[data-track-name="draft_slot_place"],[data-court-slot]',
    ))
      controls.add(slot);
    // After a player is selected, occupied/ineligible jerseys become static
    // non-button elements. They still have authoritative position/name labels.
    for (const slot of root.querySelectorAll('[aria-label]')) {
      if (/^(PG|SG|SF|PF|C)(?:\s*:|$)/.test(slot.getAttribute("aria-label") || "") &&
          slot.querySelector('[data-slot-figure]')) controls.add(slot);
    }
    if (!controls.size) return { present: false, complete: false, slots: new Map() };
    const slots = new Map();
    const positions = new Set();
    for (const slot of controls) {
      const position = controlPosition(slot);
      if (!position) continue;
      positions.add(position);
      let name = [...slot.querySelectorAll("p")]
        .map((element) => element.textContent.trim())
        .find((text) => knownNames.has(text));
      if (!name) {
        const label = slot.getAttribute("aria-label") || "";
        const english = label.match(/^(PG|SG|SF|PF|C)\s*:\s*(.+?)(?:,|$)/);
        // An explicit occupied label is authoritative even if its player's
        // stats are unknown. Unknown names must never make a slot look empty.
        if (english) name = english[2].trim();
        if (!name) {
          name = trackedNames.find((candidate) =>
            label.includes(candidate),
          );
        }
      }
      if (name) slots.set(position, name);
    }
    return { present: true, complete: positions.size === 5, slots };
  }

  function parseTray() {
    return readCourtRoster(document, runtime.namesSet, [...runtime.tracked.keys()]);
  }

  function commitPendingPickIfNeeded(trayState, cell) {
    const pending = runtime.pendingPick;
    if (!pending) return;
    const found = [...trayState.slots.entries()].find(
      ([, name]) => name === pending.row.player,
    );
    const onResults = findResultButton() !== null;
    const finalTransition =
      !trayState.present &&
      runtime.tracked.size === 4 &&
      !getPlayerListRoot() &&
      Date.now() - pending.time > 60;
    // On the current site, the next seeded cell can render before the lineup
    // tray exposes the pick that caused it. Treat that cell advance as the
    // placement confirmation so the shadow session advances before syncing.
    const cellAdvanced =
      cell && runtime.lastCell && !sameCell(cell, runtime.lastCell);
    if (found || onResults || finalTransition || cellAdvanced) {
      const position = found?.[0] || pending.position;
      runtime.tracked.set(pending.row.player, {
        row: pending.row,
        position,
        originalPosition: pending.position,
        order: ++runtime.pickOrder,
      });
      if (!pending.shadowCommitted)
        pending.shadowCommitted = commitShadowPick(
          pending.row,
          pending.position,
        );
      runtime.pendingPick = null;
      runtime.selectedRow = null;
      persistTrackedPicks();
    } else if (Date.now() - pending.time > PENDING_PICK_MAX_AGE) {
      runtime.pendingPick = null;
    }
  }

  function reconcileRoster(cell) {
    const trayState = parseTray();
    commitPendingPickIfNeeded(trayState, cell);
    if (!trayState.present) return trayState;

    if (trayState.slots.size === 0 && runtime.tracked.size) {
      // The redesigned desktop picker temporarily replaces the filled lineup
      // with five empty placement controls while a card is selected. Session
      // start/reset events are authoritative, so never erase the roster from
      // that transient empty view.
      runtime.emptyTraySince = Date.now();
      scheduleScan(850);
      return trayState;
    }
    runtime.emptyTraySince = 0;
    runtime.idleRecoveryScans = 0;

    let changed = false;
    const visibleNames = new Set(trayState.slots.values());
    for (const name of [...runtime.tracked.keys()]) {
      if (trayState.complete && !visibleNames.has(name)) {
        runtime.tracked.delete(name);
        changed = true;
      }
    }

    for (const [position, name] of trayState.slots) {
      let tracked = runtime.tracked.get(name);
      if (!tracked) {
        const restored = runtime.persistedPicks.get(name);
        let row =
          restored?.row ||
          runtime.lastOffers.get(name) ||
          runtime.recentOffers.get(name);
        if (!row && runtime.selectedRow?.player === name)
          row = runtime.selectedRow;
        if (!row) {
          const candidates = runtime.rowsByName.get(name) || [];
          if (candidates.length === 1) row = candidates[0];
        }
        if (row) {
          tracked = {
            row,
            position,
            originalPosition: restored?.originalPosition || position,
            order: restored?.order || ++runtime.pickOrder,
          };
          runtime.tracked.set(name, tracked);
          changed = true;
        }
      }
      if (tracked && tracked.position !== position) {
        tracked.position = position;
        changed = true;
      }
    }
    if (changed) persistTrackedPicks();
    return trayState;
  }

  function currentEntries(trayState) {
    const entries = [];
    const included = new Set();
    for (const [position, name] of trayState.slots) {
      const tracked = runtime.tracked.get(name);
      if (tracked?.row) {
        entries.push({ row: tracked.row, position });
        included.add(name);
      }
    }
    for (const [name, tracked] of runtime.tracked) {
      if (!included.has(name) && tracked?.row)
        entries.push({ row: tracked.row, position: tracked.position });
    }
    return entries;
  }

  function opponentPlayerIds(roster) {
    const ids = new Set();
    const entries = Array.isArray(roster)
      ? roster
      : roster && typeof roster === "object"
        ? Object.values(roster)
        : [];
    for (const entry of entries) {
      if (!entry || entry.entity === "team") continue;
      const id =
        entry.player_id ||
        entry.id ||
        entry.player?.player_id ||
        entry.player?.id;
      if (id !== undefined && id !== null && String(id)) ids.add(String(id));
    }
    return ids;
  }

  function forecastRowsForKey(key) {
    const rows = runtime.byCell.get(key) || [];
    if (!runtime.opponentPlayerIds.size) return rows;
    return rows.filter(
      (row) => !runtime.opponentPlayerIds.has(String(row.id)),
    );
  }

  function dealtSquadRows(cell) {
    if (!runtime.dealtCell || !sameCell(runtime.dealtCell, cell)) return null;
    const squad = runtime.dealtCell.squad;
    if (!Array.isArray(squad)) return null;
    const rows = resolveSquadRows(
      squad,
      runtime.byId,
      runtime.byKey,
      cell,
    );
    if (rows.length) return rows;
    return runtime.currentVisibleRows.length
      ? [...runtime.currentVisibleRows]
      : [];
  }

  function currentRowsForCell(cell) {
    const dealtRows = dealtSquadRows(cell);
    return dealtRows ?? forecastRowsForKey(`${cell.team}|${cell.era}`);
  }

  function occupiedMask(entries) {
    let mask = 0;
    for (const entry of entries) mask |= 1 << POSITION_INDEX[entry.position];
    return mask;
  }

  function compareActions(left, right) {
    if (!right) return 1;
    if (Math.abs(left.ceiling.raw - right.ceiling.raw) > EPSILON) {
      return left.ceiling.raw > right.ceiling.raw ? 1 : -1;
    }
    const leftImmediate = left.immediate?.raw ?? 0;
    const rightImmediate = right.immediate?.raw ?? 0;
    if (Math.abs(leftImmediate - rightImmediate) > EPSILON) {
      return leftImmediate > rightImmediate ? 1 : -1;
    }
    const leftMoves = left.moves?.length || 0;
    const rightMoves = right.moves?.length || 0;
    if (leftMoves !== rightMoves) return leftMoves < rightMoves ? 1 : -1;
    if (left.row.player !== right.row.player) {
      return right.row.player.localeCompare(left.row.player);
    }
    return (
      (POSITION_INDEX[right.position] ?? 5) -
      (POSITION_INDEX[left.position] ?? 5)
    );
  }

  function evaluateCell(cell, entries, withPlans = true) {
    const fixedRows = entries.map((entry) => entry.row);
    const usedNames = new Set(fixedRows.map((row) => row.player));
    const rows = currentRowsForCell(cell);
    let best = null;
    const actions = [];

    for (const row of rows) {
      if (usedNames.has(row.player)) continue;
      const placement = permittedPlacement(
        row,
        entries,
        fixedRows,
        runtime.optimizer,
      );
      if (!placement) continue;
      const { ceiling, plan } = placement;
      const action = {
        row,
        position: plan.position,
        moves: withPlans ? plan.moves : [],
        ceiling,
        immediate: calculateTeamResult([...fixedRows, row]),
      };
      actions.push(action);
      if (compareActions(action, best) > 0) best = action;
    }
    return { cell, best, actions };
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function shuffled(values, rng) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng.next() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function stratifiedFutureKeys(keys, rounds, sampleCount, seedText) {
    const keysByEra = new Map();
    for (const key of [...keys].sort()) {
      const era = key.split("|")[1];
      if (!keysByEra.has(era)) keysByEra.set(era, []);
      keysByEra.get(era).push(key);
    }
    const eras = [...keysByEra.keys()].sort();
    if (!eras.length || rounds <= 0 || sampleCount <= 0) return [];
    const rng = new MulberryRng(hashText(seedText));
    const scenarios = Array.from({ length: sampleCount }, () => []);

    for (let round = 0; round < rounds; round += 1) {
      const eraOrder = shuffled(eras, rng);
      const teamOrders = new Map(
        eras.map((era) => [era, shuffled(keysByEra.get(era), rng)]),
      );
      const eraVisits = new Map(eras.map((era) => [era, 0]));
      const teamOffsets = new Map(
        eras.map((era) => [
          era,
          Math.floor(rng.next() * teamOrders.get(era).length),
        ]),
      );
      const eraOffset = Math.floor(rng.next() * eras.length);
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const era = eraOrder[(sample + eraOffset) % eraOrder.length];
        const teams = teamOrders.get(era);
        const visit = eraVisits.get(era);
        scenarios[sample].push(
          teams[(visit + teamOffsets.get(era)) % teams.length],
        );
        eraVisits.set(era, visit + 1);
      }
    }
    return scenarios;
  }

  function sampledFuturePools(rounds, sampleCount, seedText) {
    if (rounds <= 0) return [[]];
    return stratifiedFutureKeys(
      runtime.byCell.keys(),
      rounds,
      sampleCount,
      seedText,
    ).map((scenario) =>
      scenario.map((key) => forecastRowsForKey(key)),
    );
  }

  function rolloutCandidateShortlist(picked, mask, pool) {
    const usedNames = new Set(picked.map((row) => row.player));
    const candidates = [];
    for (const row of pool || []) {
      if (usedNames.has(row.player)) continue;
      const partialRaw = rawTeamScore([...picked, row]);
      const baseValue = rolloutRowValue(row);
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (mask & bit || !(row.posMask & bit)) continue;
        candidates.push({ row, bit, positionIndex, partialRaw, baseValue });
      }
    }
    if (candidates.length <= 16) return candidates;

    const selected = new Map();
    const add = (candidate) =>
      selected.set(`${candidate.row.key}@${candidate.positionIndex}`, candidate);
    for (const candidate of [...candidates]
      .sort((left, right) => right.partialRaw - left.partialRaw)
      .slice(0, 8))
      add(candidate);
    for (const candidate of [...candidates]
      .sort((left, right) => right.baseValue - left.baseValue)
      .slice(0, 4))
      add(candidate);
    for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
      for (const candidate of candidates
        .filter((item) => item.positionIndex === positionIndex)
        .sort((left, right) => right.partialRaw - left.partialRaw)
        .slice(0, 2))
        add(candidate);
    }
    return [...selected.values()];
  }

  function rolloutSequencePolicyRaw(fixedRows, occupied, futurePools) {
    const picked = [...fixedRows];
    const usedNames = new Set(picked.map((row) => row.player));
    let mask = occupied;

    for (const pool of futurePools) {
      let best = null;
      const finalists = rolloutCandidateShortlist(picked, mask, pool);
      for (const finalist of finalists) {
          const { row, bit, partialRaw } = finalist;
          const postMask = mask | bit;
          const ceiling = runtime.optimizer.ceilingForMask(
            [...picked, row],
            postMask,
            false,
          );
          if (!ceiling) continue;
          // Benchmarked on balanced draws from the current 10,621-row pool.
          // Pure ceiling chasing averaged 65.3 wins; this 75/25 blend averaged
          // 66.7 by valuing production now without ignoring slot flexibility.
          const policyRaw = 0.75 * partialRaw + 0.25 * ceiling.raw;
          const candidate = {
            row,
            bit,
            ceilingRaw: ceiling.raw,
            partialRaw,
            policyRaw,
          };
          if (
            !best ||
            candidate.policyRaw > best.policyRaw + EPSILON ||
            (Math.abs(candidate.policyRaw - best.policyRaw) <= EPSILON &&
              candidate.partialRaw > best.partialRaw + EPSILON)
          ) {
            best = candidate;
          }
      }
      if (!best) return null;
      picked.push(best.row);
      usedNames.add(best.row.player);
      mask |= best.bit;
    }
    return rawTeamScore(picked);
  }

  function compareForecastActions(left, right) {
    if (!right) return 1;
    const opponentScore = runtime.oneVsOneOpponent?.score;
    const matchupMode =
      runtime.mode === "1v1" && Number.isFinite(opponentScore);
    const leftPath = matchupMode
      ? left.forecastMatchupRate ??
        Number(matchupResult(left.ceiling.raw, opponentScore) === "win")
      : left.forecastPathRate ?? Number(left.ceiling.possible82);
    const rightPath = matchupMode
      ? right.forecastMatchupRate ??
        Number(matchupResult(right.ceiling.raw, opponentScore) === "win")
      : right.forecastPathRate ?? Number(right.ceiling.possible82);
    const leftTrials = left.forecastOutcomes ?? 1;
    const rightTrials = right.forecastOutcomes ?? 1;
    if (
      meaningfulRateAdvantage(
        leftPath,
        leftTrials,
        rightPath,
        rightTrials,
      )
    )
      return 1;
    if (
      meaningfulRateAdvantage(
        rightPath,
        rightTrials,
        leftPath,
        leftTrials,
      )
    )
      return -1;
    const leftForecast = left.forecastRaw ?? left.ceiling.raw;
    const rightForecast = right.forecastRaw ?? right.ceiling.raw;
    if (Math.abs(leftForecast - rightForecast) > EPSILON)
      return leftForecast > rightForecast ? 1 : -1;
    if (Math.abs(leftPath - rightPath) > EPSILON)
      return leftPath > rightPath ? 1 : -1;
    return compareActions(left, right);
  }

  function retryReserveBonus(remainingRounds, retryCount) {
    if (remainingRounds <= 0 || retryCount <= 0) return 0;
    const firstRetry = 0.55 + 0.18 * remainingRounds;
    return firstRetry * (retryCount === 1 ? 1 : 1.75);
  }

  function rolloutLimits() {
    return runtime.mode === "1v1"
      ? {
          currentSamples: ONE_V_ONE_CURRENT_SAMPLES,
          retrySamples: ONE_V_ONE_RETRY_SAMPLES,
          currentActions: ONE_V_ONE_CURRENT_ACTIONS,
          retryActions: ONE_V_ONE_RETRY_ACTIONS,
        }
      : {
          currentSamples: ROLLOUT_CURRENT_SAMPLES,
          retrySamples: ROLLOUT_RETRY_SAMPLES,
          currentActions: ROLLOUT_CURRENT_ACTIONS,
          retryActions: ROLLOUT_RETRY_ACTIONS,
        };
  }

  function analysisCancelledError() {
    const error = new Error("analysis superseded");
    error.name = "AnalysisCancelledError";
    return error;
  }

  async function yieldToBrowser(shouldContinue = () => true) {
    if (!shouldContinue()) throw analysisCancelledError();
    if (typeof window.scheduler?.yield === "function") {
      await window.scheduler.yield();
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (!shouldContinue()) throw analysisCancelledError();
  }

  async function forecastEvaluation(
    evaluation,
    entries,
    {
      samples,
      maxActions,
      seed,
      retryCount = 0,
      deadline = Number.POSITIVE_INFINITY,
      shouldContinue = () => true,
    },
  ) {
    if (!evaluation?.actions?.length) return evaluation;
    const fixedRows = entries.map((entry) => entry.row);
    const remainingRounds = Math.max(0, 5 - fixedRows.length - 1);
    const perRanking = Math.max(1, Math.ceil(maxActions / 2));
    const shortlist = new Map();
    for (const action of [...evaluation.actions]
      .sort((left, right) => right.ceiling.raw - left.ceiling.raw)
      .slice(0, perRanking))
      shortlist.set(`${action.row.key}@${action.position}`, action);
    for (const action of [...evaluation.actions]
      .sort(
        (left, right) =>
          (right.immediate?.raw || 0) - (left.immediate?.raw || 0),
      )
      .slice(0, perRanking))
      shortlist.set(`${action.row.key}@${action.position}`, action);
    if (evaluation.best)
      shortlist.set(
        `${evaluation.best.row.key}@${evaluation.best.position}`,
        evaluation.best,
      );

    const sequences = sampledFuturePools(
      remainingRounds,
      samples,
      `${seed}|${fixedRows.map((row) => row.key).sort().join(";")}`,
    );
    let workSinceYield = 0;
    const forecasted = [];
    for (const action of shortlist.values()) {
      if (forecasted.length && performance.now() >= deadline) break;
      const pickedRows = [...fixedRows, action.row];
      const outcomes = [];
      for (const sequence of sequences) {
        if (outcomes.length >= 7 && performance.now() >= deadline) break;
        const raw = rolloutSequencePolicyRaw(
          pickedRows,
          action.ceiling.occupiedMask,
          sequence,
        );
        if (raw !== null) outcomes.push(raw);
        workSinceYield += 1;
        if (workSinceYield >= ANALYSIS_YIELD_EVERY) {
          workSinceYield = 0;
          await yieldToBrowser(shouldContinue);
        }
      }
      if (!outcomes.length) continue;
      outcomes.sort((left, right) => left - right);
      action.forecastRaw =
        outcomes.reduce((sum, raw) => sum + raw, 0) / outcomes.length;
      action.forecastScore = roundOne(action.forecastRaw);
      action.forecastWins =
        outcomes.reduce(
          (sum, raw) => sum + projectedWins(roundOne(raw)),
          0,
        ) / outcomes.length;
      action.forecastPathHits = outcomes.filter(
        (raw) => projectedWins(roundOne(raw)) === 82,
      ).length;
      action.forecastOutcomes = outcomes.length;
      action.forecastPathRate =
        action.forecastPathHits / action.forecastOutcomes;
      const opponentScore = runtime.oneVsOneOpponent?.score;
      if (runtime.mode === "1v1" && Number.isFinite(opponentScore)) {
        action.forecastMatchupHits = outcomes.filter(
          (raw) => matchupResult(raw, opponentScore) === "win",
        ).length;
        action.forecastDrawHits = outcomes.filter(
          (raw) => matchupResult(raw, opponentScore) === "draw",
        ).length;
        action.forecastMatchupRate =
          action.forecastMatchupHits / action.forecastOutcomes;
        action.forecastDrawRate =
          action.forecastDrawHits / action.forecastOutcomes;
      }
      action.forecastDecisionRaw =
        action.forecastRaw + retryReserveBonus(remainingRounds, retryCount);
      action.forecastLow = roundOne(
        outcomes[Math.floor((outcomes.length - 1) * 0.25)],
      );
      forecasted.push(action);
    }
    if (workSinceYield) await yieldToBrowser(shouldContinue);
    if (forecasted.length) {
      evaluation.best = forecasted.reduce((winner, action) =>
        compareForecastActions(action, winner) > 0 ? action : winner,
      null);
    }
    evaluation.forecastSamples = sequences.length;
    return evaluation;
  }

  function studioOpenMask() {
    let openMask = FULL_POSITION_MASK;
    const ordered = [...runtime.tracked.values()].sort(
      (left, right) => finiteNumber(left.order) - finiteNumber(right.order),
    );
    for (const tracked of ordered) {
      const requestedBit = 1 << POSITION_INDEX[tracked.originalPosition];
      let consumedBit =
        requestedBit & openMask & tracked.row.posMask ? requestedBit : 0;
      if (!consumedBit) {
        for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
          const bit = 1 << positionIndex;
          if (bit & openMask & tracked.row.posMask) {
            consumedBit = bit;
            break;
          }
        }
      }
      if (!consumedBit) consumedBit = openMask & -openMask;
      openMask &= ~consumedBit;
    }
    return openMask;
  }

  function feasibleOccupiedMasks(rows) {
    const masks = new Set();
    const sorted = [...rows].sort(
      (left, right) => popcount(left.posMask) - popcount(right.posMask),
    );
    const visit = (index, mask) => {
      if (index === sorted.length) {
        masks.add(mask);
        return;
      }
      const row = sorted[index];
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (!(row.posMask & bit) || mask & bit) continue;
        visit(index + 1, mask | bit);
      }
    };
    visit(0, 0);
    return [...masks];
  }

  function scenarioRowValue(row, spgCount, bpgCount) {
    return (
      COEFF_PPG * row.ppg +
      COEFF_RPG * row.rpg +
      COEFF_APG * row.apg +
      COEFF_SPG[spgCount] * row.spg +
      COEFF_BPG[bpgCount] * row.bpg
    );
  }

  function bestUniquePoolCombination(lists) {
    const order = lists
      .map((list, index) => ({ list, index }))
      .sort((left, right) => left.list.length - right.list.length);
    const suffixUpper = Array(order.length + 1).fill(0);
    for (let index = order.length - 1; index >= 0; index -= 1) {
      suffixUpper[index] = suffixUpper[index + 1] + order[index].list[0].value;
    }
    const usedNames = new Set();
    const selected = Array(lists.length);
    let bestValue = Number.NEGATIVE_INFINITY;
    let bestRows = null;

    const visit = (index, value) => {
      if (value + suffixUpper[index] <= bestValue + EPSILON) return;
      if (index === order.length) {
        bestValue = value;
        bestRows = [...selected];
        return;
      }
      const { list, index: originalIndex } = order[index];
      for (const candidate of list) {
        if (usedNames.has(candidate.row.nameId)) continue;
        usedNames.add(candidate.row.nameId);
        selected[originalIndex] = candidate.row;
        visit(index + 1, value + candidate.value);
        usedNames.delete(candidate.row.nameId);
      }
    };
    visit(0, 0);
    return bestRows ? { value: bestValue, rows: bestRows } : null;
  }

  function evaluatePlannerPools(fixedRows, pools, cache) {
    const cacheKey = pools.map((pool) => pool.key).join(">");
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const fixedNames = new Set(fixedRows.map((row) => row.nameId));
    const fixedSpg = fixedRows.filter((row) => row.spg > 0).length;
    const fixedBpg = fixedRows.filter((row) => row.bpg > 0).length;
    const remainingCount = pools.length;
    const availableSignatures = pools.map((pool) => [
      ...new Set(pool.rows.map((row) => row.sig)),
    ]);
    const signatures = Array(remainingCount);
    let best = null;

    const evaluateSignatures = () => {
      const spgCount =
        fixedSpg + signatures.reduce((sum, sig) => sum + (sig & 1 ? 1 : 0), 0);
      const bpgCount =
        fixedBpg + signatures.reduce((sum, sig) => sum + (sig & 2 ? 1 : 0), 0);
      const lists = [];
      for (let poolIndex = 0; poolIndex < pools.length; poolIndex += 1) {
        const byName = new Map();
        for (const row of pools[poolIndex].rows) {
          if (row.sig !== signatures[poolIndex] || fixedNames.has(row.nameId))
            continue;
          const value = scenarioRowValue(row, spgCount, bpgCount);
          const previous = byName.get(row.nameId);
          if (!previous || value > previous.value + EPSILON) {
            byName.set(row.nameId, { row, value });
          }
        }
        const list = [...byName.values()]
          .sort((left, right) => right.value - left.value)
          .slice(0, remainingCount);
        if (!list.length) return;
        lists.push(list);
      }
      const future = bestUniquePoolCombination(lists);
      if (!future) return;
      const fixedValue = fixedRows.reduce(
        (sum, row) => sum + scenarioRowValue(row, spgCount, bpgCount),
        0,
      );
      const raw = fixedValue + future.value;
      if (!best || raw > best.raw + EPSILON) {
        const rows = [...fixedRows, ...future.rows];
        best = { raw: rawTeamScore(rows), futureRows: future.rows };
      }
    };

    const visit = (index) => {
      if (index === remainingCount) {
        evaluateSignatures();
        return;
      }
      for (const sig of availableSignatures[index]) {
        signatures[index] = sig;
        visit(index + 1);
      }
    };
    visit(0);
    cache.set(cacheKey, best);
    return best;
  }

  function plannerRetryVariants(shadow) {
    const sequences = [[]];
    const team = shadow.remainingRespins("team") > 0;
    const era = shadow.remainingRespins("era") > 0;
    if (team) sequences.push(["team"]);
    if (era) sequences.push(["era"]);
    if (team && era) sequences.push(["team", "era"], ["era", "team"]);
    const variants = [];
    for (const sequence of sequences) {
      const next = shadow.clone();
      let valid = true;
      for (const scope of sequence) {
        if (next.remainingRespins(scope) <= 0) {
          valid = false;
          break;
        }
        const draw = next.respin(scope);
        if (!draw) {
          valid = false;
          break;
        }
      }
      if (valid && next.current) variants.push({ shadow: next, sequence });
    }
    return variants;
  }

  function backendSlotForPick(shadow, requestedPosition, sessionPlayer) {
    const compatible = (slot) =>
      slot.positions.some((position) =>
        sessionPlayer.positions.includes(position),
      );
    return (
      shadow.openSlots.find(
        (slot) => slot.id === requestedPosition && compatible(slot),
      ) ||
      shadow.openSlots.find(compatible) ||
      shadow.openSlots[0] ||
      null
    );
  }

  function solveExactSeededPlan(entries) {
    const sourceShadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !sourceShadow?.current)
      return null;
    const fixedRows = entries.map((entry) => entry.row);
    const remainingRounds = 5 - fixedRows.length;
    if (remainingRounds <= 0) {
      const result = calculateTeamResult(fixedRows);
      return { result, first: null, nodes: 0 };
    }

    const fixedNames = new Set(fixedRows.map((row) => row.player));
    const shadow = sourceShadow.clone();
    shadow.placed = new Set(
      [...shadow.placed].filter((id) => runtime.criticalStudioIds.has(id)),
    );
    const poolCache = new Map();
    let best = null;
    let nodes = 0;

    const visit = (state, remainingUiMask, pools, steps) => {
      nodes += 1;
      if (!state.openSlots.length) {
        if (pools.length !== remainingRounds) return;
        const lineup = evaluatePlannerPools(fixedRows, pools, poolCache);
        if (!lineup) return;
        const result = calculateTeamResult([
          ...fixedRows,
          ...lineup.futureRows,
        ]);
        const retryCount = steps.reduce(
          (sum, step) => sum + step.retries.length,
          0,
        );
        if (
          !best ||
          result.raw > best.result.raw + EPSILON ||
          (Math.abs(result.raw - best.result.raw) <= EPSILON &&
            retryCount < best.retryCount)
        ) {
          best = {
            result,
            retryCount,
            steps: steps.map((step, index) => ({
              ...step,
              row: lineup.futureRows[index],
            })),
          };
        }
        return;
      }

      for (const variant of plannerRetryVariants(state)) {
        const cell = variant.shadow.current;
        const cellRows = runtime.byCell.get(`${cell.team}|${cell.era}`) || [];
        for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
          const bit = 1 << positionIndex;
          if (!(remainingUiMask & bit)) continue;
          const position = POSITIONS[positionIndex];
          const effectGroups = new Map();
          for (const row of cellRows) {
            if (fixedNames.has(row.player) || !(row.posMask & bit)) continue;
            const playerId = variant.shadow.resolvePlayerId(row);
            const sessionPlayer = playerId
              ? variant.shadow.index.byId.get(playerId)
              : null;
            if (!playerId || !sessionPlayer) continue;
            const slot = backendSlotForPick(
              variant.shadow,
              position,
              sessionPlayer,
            );
            if (!slot) continue;
            const critical = runtime.criticalStudioIds.has(playerId);
            const groupKey = critical
              ? `critical:${playerId}`
              : `slot:${slot.id}`;
            let group = effectGroups.get(groupKey);
            if (!group) {
              group = {
                rows: [],
                representative: row,
                playerId,
                critical,
                slotId: slot.id,
              };
              effectGroups.set(groupKey, group);
            }
            group.rows.push(row);
          }

          for (const [effectKey, group] of effectGroups) {
            const next = variant.shadow.clone();
            if (!next.recordPick(position, group.playerId)) continue;
            if (!group.critical) next.placed.delete(group.playerId);
            if (next.openSlots.length && !next.nextSpin()) continue;
            const openMask = variant.shadow.openSlots.reduce(
              (mask, slot) => mask | (1 << POSITION_INDEX[slot.id]),
              0,
            );
            const pool = {
              key: `${cell.team}|${cell.era}|${position}|${openMask}|${effectKey}`,
              rows: group.rows,
            };
            visit(
              next,
              remainingUiMask & ~bit,
              [...pools, pool],
              [
                ...steps,
                {
                  retries: variant.sequence,
                  cell: { team: cell.team, era: cell.era },
                  position,
                  postMask: FULL_POSITION_MASK & ~(remainingUiMask & ~bit),
                },
              ],
            );
          }
        }
      }
    };

    const reachableMasks = new Set(
      reachableRosterStates(entries).map((state) =>
        state.slots.reduce(
          (mask, row, positionIndex) => mask | (row ? 1 << positionIndex : 0),
          0,
        ),
      ),
    );
    for (const occupied of reachableMasks) {
      visit(shadow.clone(), FULL_POSITION_MASK & ~occupied, [], []);
    }
    if (!best) return null;
    return {
      result: best.result,
      first: best.steps[0] || null,
      steps: best.steps,
      nodes,
    };
  }

  function retryCells(scope, cell, entries) {
    const placedIds = new Set(
      [...runtime.tracked.values()].map((tracked) => tracked.row.id),
    );
    const openMask = studioOpenMask();
    const cells = [];
    for (const key of runtime.byCell.keys()) {
      const [team, era] = key.split("|");
      if (scope === "team" && (era !== cell.era || team === cell.team))
        continue;
      if (scope === "era" && (team !== cell.team || era === cell.era)) continue;
      const hasLegal = forecastRowsForKey(key)
        .some(
          (row) => !placedIds.has(row.id) && Boolean(row.posMask & openMask),
        );
      if (hasLegal) cells.push({ team, era });
    }
    return cells;
  }

  async function summarizeRetry(
    scope,
    cell,
    entries,
    remainingRetryCount = 0,
    deadline = Number.POSITIVE_INFINITY,
    shouldContinue = () => true,
  ) {
    if (
      runtime.shadowReady &&
      runtime.shadowSynced &&
      sameCell(runtime.shadowSession?.current, cell)
    ) {
      const shadow = runtime.shadowSession.clone();
      const predicted = shadow.respin(scope);
      if (!predicted) return null;
      const predictedCell = { team: predicted.team, era: predicted.era };
      const result = evaluateCell(predictedCell, entries, false);
      const action = result.best;
      const otherScope = scope === "team" ? "era" : "team";
      let chain = null;
      if (shadow.remainingRespins(otherScope) > 0) {
        const chainedShadow = shadow.clone();
        const chainedDraw = chainedShadow.respin(otherScope);
        if (chainedDraw) {
          const chainedCell = { team: chainedDraw.team, era: chainedDraw.era };
          const chainedAction = evaluateCell(
            chainedCell,
            entries,
            false,
          ).best;
          chain = {
            scope: otherScope,
            cell: chainedCell,
            action: chainedAction || null,
          };
        }
      }
      const bestReachable =
        chain?.action && (!action || compareActions(chain.action, action) > 0)
          ? chain.action
          : action;
      const chainRecommended = Boolean(
        chain?.action &&
          ((!action?.ceiling.possible82 && chain.action.ceiling.possible82) ||
            compareActions(chain.action, action) > 0),
      );
      const opponentScore = runtime.oneVsOneOpponent?.score;
      const directMatchupWin = Boolean(
        action &&
          Number.isFinite(opponentScore) &&
          matchupResult(action.ceiling.raw, opponentScore) === "win",
      );
      const chainedMatchupWin = Boolean(
        chain?.action &&
          Number.isFinite(opponentScore) &&
          matchupResult(chain.action.ceiling.raw, opponentScore) === "win",
      );
      return {
        scope,
        exact: true,
        predictedCell,
        chain,
        chainRecommended,
        outcomes: [{ cell: predictedCell, action: action || null }],
        count: 1,
        legalCount: action ? 1 : 0,
        legalRate: action ? 1 : 0,
        meanRaw: action?.ceiling.raw || 0,
        meanScore: action?.ceiling.score || 0,
        pathRate: action?.ceiling.possible82 ? 1 : 0,
        pathHits: action?.ceiling.possible82 ? 1 : 0,
        pathTrials: 1,
        matchupRate: directMatchupWin ? 1 : 0,
        matchupHits: directMatchupWin ? 1 : 0,
        matchupTrials: 1,
        best: action || null,
        reachableLegal: Boolean(action || chain?.action),
        reachablePath: Boolean(
          action?.ceiling.possible82 || chain?.action?.ceiling.possible82,
        ),
        reachableMatchup: directMatchupWin || chainedMatchupWin,
        decisionRaw: bestReachable?.ceiling.raw || 0,
        decisionScore: bestReachable?.ceiling.score || 0,
      };
    }

    const cells = shuffled(
      retryCells(scope, cell, entries),
      new MulberryRng(hashText(`retry-cells:${scope}:${cell.team}|${cell.era}`)),
    );
    const outcomes = [];
    let legalCount = 0;
    let totalRaw = 0;
    let totalDecisionRaw = 0;
    let totalWins = 0;
    let pathHits = 0;
    let pathTrials = 0;
    let matchupHits = 0;
    let matchupTrials = 0;
    let ceilingPathCount = 0;
    const limits = rolloutLimits();
    for (const alternative of cells) {
      if (outcomes.length && performance.now() >= deadline) break;
      await yieldToBrowser(shouldContinue);
      const result = await forecastEvaluation(
        evaluateCell(alternative, entries, false),
        entries,
        {
          samples: limits.retrySamples,
          maxActions: limits.retryActions,
          seed: `retry:${scope}:${cell.team}|${cell.era}:${alternative.team}|${alternative.era}`,
          retryCount: remainingRetryCount,
          deadline,
          shouldContinue,
        },
      );
      const outcomeTrials = result.best?.forecastOutcomes ?? limits.retrySamples;
      pathTrials += outcomeTrials;
      if (
        runtime.mode === "1v1" &&
        Number.isFinite(runtime.oneVsOneOpponent?.score)
      )
        matchupTrials += outcomeTrials;
      if (!result.best) {
        outcomes.push({ cell: alternative, action: null });
        continue;
      }
      legalCount += 1;
      if (result.actions.some((action) => action.ceiling.possible82))
        ceilingPathCount += 1;
      totalRaw += result.best.forecastRaw ?? result.best.ceiling.raw;
      totalDecisionRaw +=
        result.best.forecastDecisionRaw ??
        result.best.forecastRaw ??
        result.best.ceiling.raw;
      totalWins += result.best.forecastWins ?? result.best.ceiling.wins;
      pathHits +=
        result.best.forecastPathHits ??
        Number(result.best.ceiling.possible82);
      matchupHits += result.best.forecastMatchupHits ?? 0;
      outcomes.push({ cell: alternative, action: result.best });
    }
    if (!outcomes.length) return null;
    const evaluatedCount = outcomes.length;
    const meanRaw = totalRaw / evaluatedCount;
    const best = outcomes.reduce((winner, outcome) => {
      const action = outcome.action;
      return action && (!winner || compareForecastActions(action, winner) > 0)
        ? action
        : winner;
    }, null);
    return {
      scope,
      outcomes,
      count: evaluatedCount,
      populationCount: cells.length,
      legalCount,
      legalRate: legalCount / evaluatedCount,
      meanRaw,
      meanScore: roundOne(meanRaw),
      meanWins: totalWins / evaluatedCount,
      pathRate: pathTrials ? pathHits / pathTrials : 0,
      pathHits,
      pathTrials,
      matchupRate: matchupTrials ? matchupHits / matchupTrials : 0,
      matchupHits,
      matchupTrials,
      ceilingPathRate: ceilingPathCount / evaluatedCount,
      best,
      decisionRaw: totalDecisionRaw / evaluatedCount,
    };
  }

  function normalizedButtonText(button) {
    return (button?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findRetryButtons() {
    const buttons = [...document.querySelectorAll("button")];
    const team =
      document.querySelector('button[data-track-name="draft_skip_team"]') ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "team" &&
          String(button.className).includes("amber"),
      ) ||
      buttons.find((button) =>
        String(button.className).includes("text-amber-400"),
      ) ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "team" && isVisible(button),
      );
    const era =
      document.querySelector('button[data-track-name="draft_skip_era"]') ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "era" &&
          String(button.className).includes("purple"),
      ) ||
      buttons.find((button) =>
        String(button.className).includes("text-purple-400"),
      ) ||
      buttons.find(
        (button) => normalizedButtonText(button) === "era" && isVisible(button),
      );
    return {
      team: {
        element: team || null,
        available: Boolean(team && !team.disabled),
      },
      era: { element: era || null, available: Boolean(era && !era.disabled) },
    };
  }

  function chooseAdvice(
    current,
    teamRetry,
    eraRetry,
    retries,
    priorCeiling,
    openSlots,
  ) {
    const opponentScore = runtime.oneVsOneOpponent?.score;
    const matchupMode =
      runtime.mode === "1v1" && Number.isFinite(opponentScore);
    const retryLegal = (retry) =>
      retry?.reachableLegal ?? retry?.legalCount > 0;
    const retryValue = (retry) => retry?.decisionRaw ?? retry?.meanRaw ?? 0;
    const retryPath = (retry) =>
      matchupMode
        ? retry?.reachableMatchup
          ? 1
          : retry?.matchupRate ?? 0
        : retry?.reachablePath
          ? 1
          : retry?.pathRate ?? 0;
    const retryTrials = (retry) =>
      matchupMode ? retry?.matchupTrials ?? 1 : retry?.pathTrials ?? 1;
    const availableRetries = [
      retries.team.available && teamRetry ? teamRetry : null,
      retries.era.available && eraRetry ? eraRetry : null,
    ].filter(retryLegal);
    const bestRetry = availableRetries.reduce((winner, retry) => {
      if (!winner) return retry;
      if (
        meaningfulRateAdvantage(
          retryPath(retry),
          retryTrials(retry),
          retryPath(winner),
          retryTrials(winner),
        )
      )
        return retry;
      if (
        meaningfulRateAdvantage(
          retryPath(winner),
          retryTrials(winner),
          retryPath(retry),
          retryTrials(retry),
        )
      )
        return winner;
      if (Math.abs(retryValue(retry) - retryValue(winner)) > EPSILON) {
        return retryValue(retry) > retryValue(winner) ? retry : winner;
      }
      return winner;
    }, null);
    if (!current.best) {
      if (bestRetry)
        return {
          kind: bestRetry.scope,
          reason: "No legal player fits an open position.",
        };
      return { kind: "dead", reason: "No legal pick or retry is available." };
    }

    if (!bestRetry)
      return { kind: "pick", reason: "This has the strongest expected finish." };
    const currentValue =
      current.best.forecastDecisionRaw ??
      current.best.forecastRaw ??
      current.best.ceiling.raw;
    const currentPath =
      matchupMode
        ? current.best.forecastMatchupRate ??
          Number(matchupResult(current.best.ceiling.raw, opponentScore) === "win")
        : current.best.forecastPathRate ??
          Number(current.best.ceiling.possible82);
    const expectedGain = retryValue(bestRetry) - currentValue;
    const pathGainIsMeaningful = meaningfulRateAdvantage(
      retryPath(bestRetry),
      retryTrials(bestRetry),
      currentPath,
      current.best.forecastOutcomes ?? 1,
    );
    const pathLossIsMeaningful = meaningfulRateAdvantage(
      currentPath,
      current.best.forecastOutcomes ?? 1,
      retryPath(bestRetry),
      retryTrials(bestRetry),
    );
    if (pathGainIsMeaningful && expectedGain > -0.75) {
      return {
        kind: bestRetry.scope,
        reason: bestRetry.chainRecommended
          ? `Use ${bestRetry.scope.toUpperCase()} retry, then ${bestRetry.chain.scope.toUpperCase()} retry; this is the stronger ${matchupMode ? "route to beat the bot" : "route to 82-0"}.`
          : `This retry gives the stronger sampled ${matchupMode ? "win chance" : "route to 82-0"} (${Math.round(currentPath * 100)}% → ${Math.round(retryPath(bestRetry) * 100)}%).`,
      };
    }
    if (!pathLossIsMeaningful && expectedGain > 0.25 + EPSILON) {
      return {
        kind: bestRetry.scope,
        reason: bestRetry.chainRecommended
          ? `Use ${bestRetry.scope.toUpperCase()} retry, then ${bestRetry.chain.scope.toUpperCase()} retry; that branch adds about ${expectedGain.toFixed(1)} ceiling points.`
          : `The retry improves the expected final score by about ${expectedGain.toFixed(1)} points.`,
      };
    }
    return {
      kind: "pick",
      reason:
        expectedGain > 0
          ? "The small expected gain is not worth spending the retry this early."
          : "Picking now has the stronger expected finish; save both retries.",
    };
  }

  function clearHighlights() {
    // Panel-only mode deliberately leaves the website DOM untouched.
  }

  function controlPosition(element) {
    if (!element || element.matches?.('[data-testid="player-card"]')) return null;
    // Read structural labels BEFORE any child text. Paul George's initials
    // "PG" inside a PF jersey are a player label, not a position.
    for (const key of ["data-position", "data-court-slot", "data-tray-slot", "aria-label"]) {
      const text = String(element.getAttribute?.(key) || "").trim();
      const match = text.match(/^(PG|SG|SF|PF|C)(?:\s*:|\b)/);
      if (match) return match[1];
    }
    const caption = element.querySelector?.('[data-slot-caption]') ||
      element.parentElement?.querySelector?.(':scope > [data-slot-caption]');
    const captionText = caption?.textContent.trim();
    if (POSITIONS.includes(captionText)) return captionText;
    for (const span of element.querySelectorAll?.("span") || []) {
      if (span.closest?.('[data-slot-garment]')) continue;
      const text = span.textContent.trim();
      if (POSITIONS.includes(text)) return text;
    }
    return null;
  }

  function lineupMatchesSnapshot(entries, snapshot) {
    if (!snapshot.present || !snapshot.complete) return false;
    if (entries.length !== snapshot.slots.size) return false;
    return [...snapshot.slots].every(([position, player]) => entries.some((entry) =>
      entry.position === position && entry.row.player === player));
  }

  function placementPlanIsLegal(entries, row, plan) {
    if (!plan || !row) return false;
    const slots = new Map();
    const names = new Set();
    for (const entry of entries) {
      if (POSITION_INDEX[entry.position] === undefined || slots.has(entry.position) ||
          names.has(entry.row.player) || !(entry.row.posMask & (1 << POSITION_INDEX[entry.position])))
        return false;
      slots.set(entry.position, entry.row);
      names.add(entry.row.player);
    }
    if ([...slots.values()].some((picked) => picked.player === row.player)) return false;
    for (const move of plan.moves || []) {
      const moving = slots.get(move.from);
      if (POSITION_INDEX[move.to] === undefined || !moving || moving.player !== move.player || slots.has(move.to) ||
          !(moving.posMask & (1 << POSITION_INDEX[move.to]))) return false;
      slots.delete(move.from);
      slots.set(move.to, moving);
    }
    return POSITION_INDEX[plan.position] !== undefined && !slots.has(plan.position) &&
      Boolean(row.posMask & (1 << POSITION_INDEX[plan.position]));
  }

  function scoreText(result) {
    return `${result.score.toFixed(1)} · ${result.wins}-${result.losses}`;
  }

  function cancelLiveAnalysis() {
    const job = runtime.liveAnalysisJob;
    if (!job) return;
    runtime.liveAnalysisJob = null;
    job.worker?.terminate();
    if (job.url) URL.revokeObjectURL(job.url);
    clearTimeout(job.timer);
    runtime.analysisInProgressKey = "";
  }

  function requestLiveAnalysis(key, input) {
    if (runtime.liveAnalysisJob?.key === key) return;
    cancelLiveAnalysis();
    const job = { key, generation: runtime.analysisGeneration, worker: null, url: null, timer: 0 };
    runtime.liveAnalysisJob = job;
    runtime.analysisInProgressKey = key;
    const isCurrent = () => runtime.liveAnalysisJob === job &&
      runtime.analysisGeneration === job.generation && readUiState().enabled;
    const finish = (message) => {
      if (!isCurrent()) return;
      cancelLiveAnalysis();
      runtime.lastAnalysisKey = key;
      runtime.lastAnalysis = message.advice ? { live: true, ...message.advice } :
        { live: true, error: message.error || "Calculation failed. Turn the coach off and on to retry." };
      scheduleScan(0);
    };
    // A browser/CSP that disallows workers gets the unchanged full planner.
    // Yield first so the status can paint; never shrink the model for speed.
    const fallback = () => {
      if (!isCurrent() || job.fallback) return;
      job.fallback = true;
      job.worker?.terminate();
      job.worker = null;
      if (job.url) URL.revokeObjectURL(job.url);
      job.url = null;
      job.timer = window.setTimeout(() => {
        if (!isCurrent()) return;
        try {
          finish({ advice: new LiveDraftPlanner(input.pools, input.entries)
            .advise(input.rows, input.cell, input.retries) });
        } catch (error) { finish({ error: String(error?.message || error) }); }
      }, 32);
    };
    try {
      runtime.liveWorkerSource ||= livePlannerWorkerSource();
      job.url = URL.createObjectURL(new Blob([runtime.liveWorkerSource], { type: "text/javascript" }));
      job.worker = new Worker(job.url, { name: "82-0 Coach planner" });
      job.worker.onmessage = ({ data }) => finish(data);
      job.worker.onerror = (event) => { event.preventDefault(); fallback(); };
      job.worker.onmessageerror = fallback;
      job.worker.postMessage(input);
    } catch (_) { fallback(); }
  }

  function renderLiveAdvice(cell, entries, retries) {
    const rows = currentRowsForCell(cell);
    const missing = (runtime.dealtCell?.squad.length || 0) - rows.length;
    const freeRetry = (scope) => {
      const booster = runtime.dealtCell?.boosters?.[`respin_${scope}`];
      return retries[scope].available && (!booster ||
        (booster.enabled !== false && booster.next_use === "free" && booster.free_left > 0));
    };
    const available = { team: freeRetry("team"), era: freeRetry("era") };
    const analysisKey = JSON.stringify([runtime.dealtCell?.seq, cell.team, cell.era,
      entries.map((entry) => [entry.row.key, entry.position]), available,
      rows.map((row) => row.key), runtime.rows.length]);
    if (runtime.lastAnalysisKey !== analysisKey || !runtime.lastAnalysis?.live) {
      renderAnalyzing();
      if (runtime.liveAnalysisJob?.key !== analysisKey) requestLiveAnalysis(analysisKey, {
        pools: livePlanningPools(), entries, rows,
        cell: { teamId: runtime.dealtCell?.teamId || cell.team, era: cell.era }, retries: available,
      });
      return;
    }
    const advice = runtime.lastAnalysis;
    if (advice.error) { renderLoading(`Could not analyze this roll: ${advice.error}`, true); return; }
    const best = advice.best;
    if (best && !placementPlanIsLegal(entries, best.row, best)) {
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      renderLoading("Updating lineup…");
      scheduleScan(120);
      return;
    }
    const isRetry = advice.kind === "team" || advice.kind === "era";
    const move = !isRetry && best?.moves[0];
    const color = isRetry ? COLORS[advice.kind] : move ? COLORS.position : best ? COLORS.pick : COLORS.team;
    const target = runtime.oneVsOneOpponent?.score;
    const status = Number.isFinite(target)
      ? `Bot score to beat ${target.toFixed(1)}`
      : isRetry ? "Retry recommended before picking" : "Best modeled draft route";
    const action = isRetry ? `Reroll ${advice.kind === "team" ? "TEAM" : "ERA"}` : move
      ? `${move.player} · ${move.from}`
      : best ? best.row.player
      : missing > 0 ? "Player stats are hidden" : "No available player fits";
    const position = isRetry ? null : move?.to || best?.position;
    const route = isRetry
      ? `Use your free ${advice.kind} retry. Its estimated benefit outweighs saving it for later.`
      : move ? [
      ...best.moves.slice(1).map((step) =>
        `move ${step.player} ${step.from} → ${step.to}`),
      `pick ${best.row.player} → ${best.position}`,
    ].join("; then ") : best
      ? `${best.row.ppg.toFixed(1)} PTS · ${best.row.rpg.toFixed(1)} REB · ${best.row.apg.toFixed(1)} AST · ${best.row.spg.toFixed(1)} STL · ${best.row.bpg.toFixed(1)} BLK`
      : missing > 0
        ? "This roll has no known stats yet. Classic rolls saved in this browser can provide stats for Hoop IQ."
        : "Use an available retry to get a legal player.";
    const unknown = missing > 0
      ? `<div class="filter-hint">${missing} offered player${missing === 1 ? " has" : "s have"} unknown stats; ${best ? "this suggestion covers known players only" : "an accurate pick comparison is unavailable"}.</div>` : "";
    const finalRound = entries.length === 4;
    const forecastText = (scope) => !available[scope] ? "no free retry" :
      advice.forecasts[scope] === null ? "not enough samples" :
        best ? `${(advice.forecasts[scope] - best.value) >= 0 ? "+" : ""}${(advice.forecasts[scope] - best.value).toFixed(1)} estimated score vs pick` : "retry to find a legal pick";
    const details = readUiState().details ? `<div class="details">
      <div class="row"><span>Picked team</span><strong>${entries.length}/5</strong></div>
      <div class="row"><span>Players evaluated</span><strong>${rows.length}</strong></div>
      <div class="row"><span>Team retry</span><strong>${forecastText("team")}</strong></div>
      <div class="row"><span>Era retry</span><strong>${forecastText("era")}</strong></div>
      <div class="row"><span>Method</span><strong>Flexible-roster score planning</strong></div>
      ${entries.length >= 3 ? '<div class="row"><span>Scoring</span><strong>Complete-team formula</strong></div>' : ""}
      <div class="row"><span>Planning samples</span><strong>${advice.sampleCount} team/era pools</strong></div>
      <div class="sub">Retry estimates use sampled rolls and your locally saved Classic stats. They are estimates, not guaranteed outcomes or proof of 82-0 feasibility.</div>
      </div>` : "";
    renderPanel(`<div class="status" style="--status:${color}"><span class="dot"></span><span>${escapeHtml(status)}</span></div>
      <div class="action" style="--action:${color}"><div class="eyebrow">${isRetry ? "REROLL NOW" : move ? "MOVE FIRST" : best ? "PICK NOW" : "ROLL GUIDANCE"}</div>
      <div class="primary"><span class="name">${escapeHtml(action)}</span>${position ? `<span class="arrow">→</span><span class="position">${position}</span>` : ""}</div>
      <div class="sub">${escapeHtml(route)}</div>
      ${finalRound && best && !isRetry ? `<div class="metrics"><span>Calculated final score</span><strong>${best.result.score.toFixed(1)}</strong></div>` : ""}</div>
      ${unknown}${isRetry && best ? `<div class="fallback">If you prefer to pick: ${escapeHtml(best.row.player)} → ${best.position}${best.moves.length ? " (requires a lineup move)" : ""}.</div>` : ""}
      <button class="details-toggle" id="details-toggle">${readUiState().details ? "Hide details" : "Why this choice?"}</button>${details}`,
      `live:${analysisKey}:${advice.kind}:${best?.row.id}:${best?.position}:${JSON.stringify(best?.moves)}:${missing}:${readUiState().details}`);
  }

  function renderAdvice(advice, entries, cards, retries) {
    const ui = readUiState();
    const current = advice.current;
    const best = current.best;
    const seededResult = advice.seededPlan?.result || null;
    const isRetry = advice.kind === "team" || advice.kind === "era";
    const move = advice.kind === "pick" ? best?.moves?.[0] : null;
    const isOneVsOne = runtime.mode === "1v1";
    const opponentScore = runtime.oneVsOneOpponent?.score;
    const hasOpponentScore = Number.isFinite(opponentScore);
    const retriesAvailable = retries.team.available || retries.era.available;
    const retryCanRestoreCeiling = Boolean(
      isOneVsOne && hasOpponentScore
        ? (advice.teamRetry?.reachableMatchup ??
            advice.teamRetry?.matchupRate > 0) ||
            (advice.eraRetry?.reachableMatchup ??
              advice.eraRetry?.matchupRate > 0)
        : (advice.teamRetry?.reachablePath ??
            advice.teamRetry?.ceilingPathRate > 0) ||
            (advice.eraRetry?.reachablePath ??
              advice.eraRetry?.ceilingPathRate > 0),
    );
    const availableRetrySummaries = [
      retries.team.available ? advice.teamRetry : null,
      retries.era.available ? advice.eraRetry : null,
    ].filter(Boolean);
    const exactRetryTreeExhausted = Boolean(
      retriesAvailable &&
        availableRetrySummaries.length ===
          Number(retries.team.available) + Number(retries.era.available) &&
        availableRetrySummaries.every((retry) => retry.exact) &&
        !retryCanRestoreCeiling,
    );
    const impossible =
      !runtime.modelMismatch &&
      (isOneVsOne && hasOpponentScore
        ? advice.priorCeiling &&
          matchupResult(advice.priorCeiling.raw, opponentScore) !== "win"
        : seededResult
          ? !seededResult.possible82
          : advice.priorCeiling && !advice.priorCeiling.possible82);
    const currentCanKeepCeiling = current.actions.some(
      (action) =>
        isOneVsOne && hasOpponentScore
          ? matchupResult(action.ceiling.raw, opponentScore) === "win"
          : action.ceiling.possible82,
    );
    const forcedImpossible =
      !runtime.modelMismatch &&
      !seededResult &&
      !impossible &&
      !currentCanKeepCeiling &&
      (!retriesAvailable ||
        exactRetryTreeExhausted ||
        !retryCanRestoreCeiling);
    const chosenRetry =
      advice.kind === "team"
        ? advice.teamRetry
        : advice.kind === "era"
          ? advice.eraRetry
          : null;
    const recommendedKeepsCeiling = isRetry
      ? isOneVsOne && hasOpponentScore
        ? chosenRetry?.reachableMatchup ?? chosenRetry?.matchupRate > 0
        : chosenRetry?.reachablePath ?? chosenRetry?.ceilingPathRate > 0
      : isOneVsOne && hasOpponentScore
        ? best && matchupResult(best.ceiling.raw, opponentScore) === "win"
        : best?.ceiling.possible82;
    const atRisk =
      !runtime.modelMismatch &&
      !seededResult &&
      !impossible &&
      !forcedImpossible &&
      !recommendedKeepsCeiling;
    const sampledPathRate = seededResult
      ? Number(seededResult.possible82)
      : isRetry
        ? isOneVsOne && hasOpponentScore
          ? chosenRetry?.matchupRate || 0
          : chosenRetry?.pathRate || 0
        : isOneVsOne && hasOpponentScore
          ? best?.forecastMatchupRate || 0
          : best?.forecastPathRate || 0;
    const sampledPathPercent = Math.round(sampledPathRate * 100);
    const bestReachableScore = roundOne(
      Math.max(
        0,
        ...current.actions.map((action) => action.ceiling.raw),
        ...availableRetrySummaries.map(
          (retry) => retry.best?.ceiling.raw || 0,
        ),
      ),
    );
    const statusColor = runtime.modelMismatch
      ? COLORS.team
      : impossible || forcedImpossible
        ? COLORS.impossible
        : atRisk || sampledPathPercent < 25
          ? COLORS.team
          : COLORS.pick;
    const statusText = runtime.modelMismatch
      ? "Site model changed — recommendations are provisional"
      : isOneVsOne
        ? hasOpponentScore
          ? impossible
            ? `Bot score ${opponentScore.toFixed(1)} · win impossible · absolute max ${advice.priorCeiling.score.toFixed(1)}`
            : forcedImpossible
              ? `Bot score ${opponentScore.toFixed(1)} · win now unreachable · best reachable ${bestReachableScore.toFixed(1)}`
            : sampledPathPercent
              ? `Bot score to beat ${opponentScore.toFixed(1)} · ${sampledPathPercent}% sampled win chance`
              : `Bot score to beat ${opponentScore.toFixed(1)} · a win remains possible`
          : "1v1 · optimizing the highest final score"
      : impossible
        ? seededResult
          ? `82-0 impossible · exact seeded max ${seededResult.score.toFixed(1)}`
          : `82-0 impossible · absolute max ${advice.priorCeiling.score.toFixed(1)}`
        : forcedImpossible
          ? `82-0 now impossible · best reachable max ${bestReachableScore.toFixed(1)}`
          : atRisk
            ? "82-0 remains mathematically possible · recommendation favors the higher average"
            : seededResult
              ? `82-0 achievable · exact seeded max ${seededResult.score.toFixed(1)}`
              : sampledPathPercent
                ? `82-0 mathematically possible · ${sampledPathPercent}% of sampled futures`
                : "82-0 mathematically possible · not reached in sampled futures";
    const actionColor = isRetry
      ? COLORS[advice.kind]
      : move
        ? COLORS.position
        : advice.kind === "pick"
          ? COLORS.pick
          : COLORS.impossible;
    const eyebrow = move
      ? "MOVE FIRST"
      : advice.kind === "pick"
        ? "PICK NOW"
        : advice.kind === "team"
          ? "TEAM RETRY"
          : advice.kind === "era"
            ? "ERA RETRY"
            : "NO LEGAL ACTION";
    const primary = move
      ? `${move.player} · ${move.from}`
      : isRetry
        ? advice.kind === "team"
          ? `Keep ${advice.cell.era} · reroll team`
          : `Keep ${advice.cell.team} · reroll era`
        : best?.row.player || "Retry unavailable";
    const position = move
      ? move.to
      : advice.kind === "pick" && best
        ? best.position
        : "";
    const pickedResult = calculateTeamResult(entries.map((entry) => entry.row));
    const currentLine = best ? scoreText(best.ceiling) : "—";
    const expectedLine = Number.isFinite(best?.forecastScore)
      ? isOneVsOne && hasOpponentScore
        ? `${best.forecastScore.toFixed(1)} avg · ${Math.round((best.forecastMatchupRate || 0) * 100)}% sampled win chance`
        : `${best.forecastScore.toFixed(1)} avg · ${best.forecastWins.toFixed(0)} wins avg`
      : currentLine;

    const stats = best
      ? `${best.row.ppg.toFixed(1)} PTS · ${best.row.rpg.toFixed(1)} REB · ${best.row.apg.toFixed(1)} AST · ${best.row.spg.toFixed(1)} STL · ${best.row.bpg.toFixed(1)} BLK`
      : "";
    const fallbackHtml =
      isRetry && best
        ? `<div class="fallback">Best fallback if you override: <strong>${escapeHtml(best.row.player)} → ${best.position}</strong><br>${escapeHtml(stats)}</div>`
        : "";
    const recommendedCardVisible = best
      ? cards.some(
          ({ row, element }) => row.key === best.row.key && isVisible(element),
        )
      : true;
    const filterHint =
      best && !recommendedCardVisible
        ? `<div class="filter-hint">Find <strong>${escapeHtml(best.row.player)}</strong> in the current list; clear search if a filter is active.</div>`
        : "";
    const formatRetry = (retry, available) => {
      if (!retry) return available ? "no legal outcomes" : "used";
      if (retry.exact) {
        const cellText = `${retry.predictedCell.team} ${retry.predictedCell.era}`;
        const direct = retry.legalCount
          ? isOneVsOne && hasOpponentScore
            ? `${cellText} · ${retry.meanScore.toFixed(1)} · ${retry.matchupRate ? "beats bot" : "does not beat bot"}`
            : `${cellText} · ${retry.meanScore.toFixed(1)} · ${retry.pathRate ? "keeps 82 path" : "loses 82 path"}`
          : `${cellText} · no legal UI pick`;
        if (!retry.chainRecommended || advice.seededPlan) return direct;
        const chained = retry.chain;
        return `${direct}; then ${chained.scope.toUpperCase()} → ${chained.cell.team} ${chained.cell.era} · ${chained.action.ceiling.score.toFixed(1)}`;
      }
      return isOneVsOne && hasOpponentScore
        ? `${retry.meanScore.toFixed(1)} avg · ${Math.round((retry.matchupRate || 0) * 100)}% sampled win chance`
        : `${retry.meanScore.toFixed(1)} avg · ${retry.meanWins.toFixed(0)} wins avg · ${Math.round(retry.pathRate * 100)}% sampled 82`;
    };
    const teamForecast = formatRetry(advice.teamRetry, retries.team.available);
    const eraForecast = formatRetry(advice.eraRetry, retries.era.available);
    const actionMetric = chosenRetry
      ? seededResult
        ? scoreText(seededResult)
        : chosenRetry.exact
          ? isOneVsOne && hasOpponentScore
            ? `${(chosenRetry.chainRecommended ? chosenRetry.decisionScore : chosenRetry.meanScore).toFixed(1)} · ${(chosenRetry.reachableMatchup ?? chosenRetry.matchupRate) ? "beats bot" : "below bot"}`
            : `${(chosenRetry.chainRecommended ? chosenRetry.decisionScore : chosenRetry.meanScore).toFixed(1)} · ${(chosenRetry.reachablePath ?? chosenRetry.pathRate) ? "82 path" : "no 82 path"}`
          : isOneVsOne && hasOpponentScore
            ? `${chosenRetry.meanScore.toFixed(1)} avg · ${Math.round((chosenRetry.matchupRate || 0) * 100)}% sampled win chance`
            : `${chosenRetry.meanScore.toFixed(1)} avg · ${chosenRetry.meanWins.toFixed(0)} wins avg`
      : expectedLine;

    const seededRoute = advice.seededPlan?.steps?.length
      ? `<div class="route">
          <div class="route-title">Optimal remaining route</div>
          ${advice.seededPlan.steps
            .map((step, index) => {
              const retriesText = step.retries.length
                ? `${step.retries.map((scope) => scope.toUpperCase()).join(" → ")} → `
                : "PICK · ";
              const cellText = step.cell
                ? `${step.cell.team} ${step.cell.era} · `
                : "";
              return `<div class="route-step"><span>R${entries.length + index + 1}</span><strong>${escapeHtml(`${retriesText}${cellText}${step.row.player} → ${step.position}`)}</strong></div>`;
            })
            .join("")}
          <div class="sub">Rechecked after every action.</div>
        </div>`
      : "";

    const details = ui.details
      ? `<div class="details">
          <div class="row"><span>Picked team now</span><strong>${entries.length}/5 · ${scoreText(pickedResult)}</strong></div>
          ${isOneVsOne && hasOpponentScore ? `<div class="row"><span>Bot score to beat</span><strong>${opponentScore.toFixed(1)}</strong></div>` : ""}
          <div class="row"><span>Expected final</span><strong>${escapeHtml(expectedLine)}</strong></div>
          <div class="row"><span>Best current-pool ceiling</span><strong>${escapeHtml(currentLine)}</strong></div>
          ${seededResult ? `<div class="row"><span>Exact seeded final maximum</span><strong>${escapeHtml(scoreText(seededResult))}</strong></div>` : ""}
          <div class="row"><span>Team retry forecast</span><strong>${escapeHtml(teamForecast)}</strong></div>
          <div class="row"><span>Era retry forecast</span><strong>${escapeHtml(eraForecast)}</strong></div>
          <div class="row"><span>Reason</span><strong>${escapeHtml(advice.reason)}</strong></div>
          <div class="row"><span>Model</span><strong>${advice.seededPlan ? "Exact seeded full draft" : runtime.shadowReady && runtime.shadowSynced ? "Exact seeded retries" : "Balanced adaptive rollouts"} · ${MODEL_VERIFIED}</strong></div>
          ${seededRoute}
          <div class="legend">
            <span class="swatch" style="--c:${COLORS.pick}">pick</span>
            <span class="swatch" style="--c:${COLORS.team}">team retry</span>
            <span class="swatch" style="--c:${COLORS.era}">era retry</span>
            <span class="swatch" style="--c:${COLORS.position}">position</span>
            <span class="swatch" style="--c:${COLORS.impossible}">impossible</span>
          </div>
        </div>`
      : "";

    const remainingAfterAction = POSITIONS.filter((openPosition) => {
      const bit = 1 << POSITION_INDEX[openPosition];
      if (occupiedMask(entries) & bit) return false;
      return advice.kind !== "pick" || move || openPosition !== best?.position;
    });
    const remainingMoveRoute = move
      ? [
          ...(best.moves || [])
            .slice(1)
            .map((nextMove) =>
              `move ${nextMove.player} ${nextMove.from} → ${nextMove.to}`,
            ),
          `pick ${best.row.player} → ${best.position}`,
        ].join("; then ")
      : "";
    const subline = move
      ? `Then ${remainingMoveRoute}`
      : isRetry
        ? advice.reason
        : stats;
    const html = `
      <div class="status" style="--status:${statusColor}"><span class="dot"></span><span>${escapeHtml(statusText)}</span></div>
      <div class="action" style="--action:${actionColor}">
        <div class="eyebrow">${eyebrow}</div>
        <div class="primary"><span class="name">${escapeHtml(primary)}</span>${position ? `<span class="arrow">→</span><span class="position">${position}</span>` : ""}</div>
        <div class="sub">${escapeHtml(subline)}</div>
        <div class="metrics"><span>${seededResult ? "Exact seeded final" : isRetry ? "Retry expected final" : "Expected final"}</span><strong>${escapeHtml(actionMetric)}</strong><span>${advice.kind === "pick" && !move ? "Open after pick" : "Open positions"}</span><strong>${escapeHtml(remainingAfterAction.join(" · ") || "Complete")}</strong></div>
      </div>
      ${fallbackHtml}
      ${filterHint}
      <button class="details-toggle" id="details-toggle">${ui.details ? "Hide details" : "Why this choice?"}</button>
      ${details}
    `;

    const signature = JSON.stringify({
      version: VERSION,
      kind: advice.kind,
      cell: advice.cellSignature,
      player: best?.row.key,
      position: best?.position,
      move: move ? `${move.player}:${move.from}:${move.to}` : "",
      impossible,
      forcedImpossible,
      seeded: seededResult?.raw,
      mismatch: runtime.modelMismatch,
      opponentScore,
      details: ui.details,
      team: teamForecast,
      era: eraForecast,
    });
    renderPanel(html, signature);
  }

  function findResultButton() {
    return (
      [...document.querySelectorAll("button,a")].find((element) =>
        /^(?:build another(?: team)?|draft again)$/i.test((element.textContent || "").trim()),
      ) || null
    );
  }

  function officialRecordFromPage() {
    const labels = [...document.querySelectorAll("span,p,div")].filter(
      (element) =>
        isVisible(element) &&
        /^projected record$/i.test(directText(element)),
    );
    for (const label of labels) {
      let container = label.parentElement;
      for (let depth = 0; container && depth < 6; depth += 1) {
        const text = (container.innerText || container.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        for (const match of text.matchAll(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/g)) {
          const wins = Number(match[1]);
          const losses = Number(match[2]);
          if (wins + losses === 82) return { wins, losses, score: null };
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  function officialScoreFromPage() {
    for (const element of document.querySelectorAll("span,p")) {
      if (!isVisible(element)) continue;
      const match = directText(element).match(/^([\d,.]+)\s*pts$/i);
      if (!match) continue;
      const score = Number(match[1].replaceAll(",", ""));
      if (Number.isFinite(score) && score >= 0 && score <= 200) return score;
    }
    return null;
  }

  function renderResultsIfPresent() {
    const resultButton = findResultButton();
    if (!resultButton) return false;
    clearHighlights();
    const rows = [...runtime.tracked.values()].map((tracked) => tracked.row);
    const calculated = rows.length === 5 ? calculateTeamResult(rows) : null;
    const official = runtime.officialResult || officialRecordFromPage();
    if (runtime.liveDataMode && !official) {
      renderPanel(`<div class="status" style="--status:${COLORS.muted}"><span class="dot"></span><span>Final team</span></div>
        <div class="action" style="--action:${COLORS.muted}"><div class="eyebrow">FINAL RESULT</div>
        <div class="primary"><span class="name">${calculated ? `${calculated.score.toFixed(1)} calculated score` : "Waiting for result"}</span></div>
        <div class="sub">Waiting for 82-0's final record…</div></div>`,
        `live-result-waiting:${calculated?.score}`);
      return true;
    }
    if (!calculated && !official) {
      renderPanel(
        '<div class="loading">Final screen detected. Waiting for the official result…</div>',
        `result-missing:${rows.length}`,
      );
      return true;
    }
    const displayed = official || calculated;
    const officialScore = runtime.officialResult?.score;
    const pageScore = officialScoreFromPage();
    const score = Number.isFinite(officialScore)
      ? officialScore
      : calculated?.score ?? pageScore;
    const opponentScore = runtime.oneVsOneOpponent?.score;
    const isOneVsOneResult =
      runtime.mode === "1v1" &&
      Number.isFinite(score) &&
      Number.isFinite(opponentScore);
    const verdict = isOneVsOneResult
      ? matchupResult(score, opponentScore)
      : null;
    const possible82 = displayed.wins === 82;
    const color = isOneVsOneResult
      ? verdict === "win"
        ? COLORS.pick
        : verdict === "draw"
          ? COLORS.team
          : COLORS.impossible
      : possible82
        ? COLORS.pick
        : COLORS.impossible;
    const sourceLine = isOneVsOneResult
      ? official
        ? calculated
          ? "1v1 result from 82-0 · your score checked from all five selected peaks."
          : "1v1 result shown by 82-0."
        : "Matchup projected from your five peaks and the bot score supplied with this session."
      : official
        ? calculated
          ? "Final result from 82-0 · score checked from all five selected peaks."
          : "Final result shown by 82-0."
        : "Record projected with the current 82-0 curve; score exactly recomputed from all five peaks.";
    const historySummary = official
      ? resultHistorySummary(recordCompletedGame(displayed, score))
      : "";
    const resultStatus = isOneVsOneResult
      ? verdict === "win"
        ? "1v1 won"
        : verdict === "draw"
          ? "1v1 draw"
          : "1v1 lost"
      : possible82
        ? "82-0 achieved"
        : "Final team";
    const resultPrimary = isOneVsOneResult
      ? `${score.toFixed(1)} · ${opponentScore.toFixed(1)}`
      : `${displayed.wins}-${displayed.losses} · ${Number.isFinite(score) ? score.toFixed(1) : "—"}`;
    renderPanel(
      `<div class="status" style="--status:${color}"><span class="dot"></span><span>${resultStatus}</span></div>
       <div class="action" style="--action:${color}"><div class="eyebrow">${isOneVsOneResult ? "YOU · BOT" : "FINAL RESULT"}</div><div class="primary"><span class="name">${resultPrimary}</span></div><div class="sub">${escapeHtml(sourceLine)}${historySummary ? `<br>${escapeHtml(historySummary)}` : ""}</div></div>`,
      `result:${score}:${displayed.wins}:${runtime.mode}:${opponentScore}:${official ? "official" : "projected"}`,
    );
    if (calculated) checkModelDrift(calculated);
    return true;
  }

  function checkModelDrift(calculated) {
    if (runtime.modelMismatch) return;
    let displayed = null;
    if (runtime.mode === "1v1") {
      displayed = runtime.officialResult?.score;
      if (!Number.isFinite(displayed)) return;
    } else {
      const candidates = [];
      for (const element of document.querySelectorAll("span,p")) {
        const text = directText(element);
        const match = text.match(/(?:^|·\s*)([\d,.]+)\s*pts\s*$/i);
        if (!match) continue;
        const value = Number(match[1].replaceAll(",", ""));
        if (Number.isFinite(value) && value >= 0 && value <= 200)
          candidates.push(value);
      }
      if (candidates.length !== 1) return;
      displayed = candidates[0];
    }
    if (Math.abs(displayed - calculated.score) <= 0.11) {
      runtime.resultMismatchCandidate = null;
      return;
    }
    if (runtime.resultMismatchCandidate === displayed) {
      runtime.modelMismatch = true;
      safeSessionSet(MISMATCH_KEY, "1");
      runtime.lastAdviceSignature = "";
      scheduleScan(0);
    } else {
      runtime.resultMismatchCandidate = displayed;
      scheduleScan(300);
    }
  }

  function detectModeFromPage() {
    const query = new URLSearchParams(location.search);
    const queryMode = query.get("mode") || query.get("play");
    const opponent = query.get("opponent");
    const stats = query.get("stats");
    // The redesigned site represents 1v1 as Classic + a bot variant rather
    // than mode=1v1. Check variants before the base mode so a later scan does
    // not overwrite the click-captured 1v1 label.
    if (opponent === "bot" || queryMode === "1v1") setMode("1v1");
    else if (stats === "hidden" || queryMode === "hoopiq") setMode("hoopiq");
    else if (queryMode === "classic") setMode("classic");
    const bodyText = document.body?.innerText || "";
    if (/\bHOOP\s*IQ\b/i.test(bodyText) && getPlayerListRoot())
      setMode("hoopiq");
    if (
      /finding an opponent|coin flip|you pick first|opponent is picking/i.test(
        bodyText,
      )
    )
      setMode("1v1");
  }

  function resetRuntime(mode) {
    cancelLiveAnalysis();
    runtime.tracked.clear();
    runtime.lastOffers.clear();
    runtime.recentOffers.clear();
    runtime.selectedRow = null;
    runtime.pendingPick = null;
    runtime.lastCell = null;
    runtime.lastAdvice = null;
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    runtime.analysisInProgressKey = "";
    runtime.lastAdviceSignature = "";
    runtime.persistedPicks.clear();
    runtime.pickOrder = 0;
    runtime.emptyTraySince = 0;
    runtime.idleRecoveryScans = 0;
    runtime.officialResult = null;
    runtime.oneVsOneOpponent = null;
    runtime.opponentPlayerIds = new Set();
    runtime.currentVisibleRows = [];
    runtime.resultRecorded = false;
    runtime.sessionPayload = null;
    runtime.dealtSessionId = null;
    runtime.dealtCell = null;
    runtime.liveReel = null;
    runtime.shadowSession = null;
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowError = null;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;
    runtime.criticalStudioIds = new Set();
    safeSessionRemove(PICKS_KEY);
    runtime.optimizer?.clearCache();
    if (mode) setMode(mode);
  }

  function inferPositionTarget(target) {
    const button = target.closest?.('button,[role="button"]');
    if (!button) return null;
    return controlPosition(button);
  }

  function handleDocumentClick(event) {
    const button = event.target.closest?.("button,a");
    const text = (button?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const trackName = button?.getAttribute("data-track-name") || "";
    if (text.includes("play 1v1") || trackName === "mode_play_1v1")
      resetRuntime("1v1");
    else if (
      text.includes("play hoop") ||
      text === "hoop iq" ||
      trackName === "mode_play_hoopiq"
    )
      resetRuntime("hoopiq");
    else if (
      text.includes("play classic") ||
      text === "classic" ||
      trackName === "mode_play_classic"
    )
      resetRuntime("classic");
    else if (/^(?:build another(?: team)?|draft again)$/.test(text)) resetRuntime(runtime.mode);

    // The new site can delay updating the lineup tray until the next roll.
    // A visible SPIN button proves the placement succeeded, so advance the
    // seeded shadow before the site renders the next cell.
    if (text === "spin" && runtime.pendingPick?.row) {
      if (!runtime.pendingPick.shadowCommitted)
        runtime.pendingPick.shadowCommitted = commitShadowPick(
          runtime.pendingPick.row,
          runtime.pendingPick.position,
        );
    }

    const retryButtons = findRetryButtons();
    if (
      button &&
      (button === retryButtons.team.element ||
        button === retryButtons.era.element)
    ) {
      commitShadowRetry(button === retryButtons.team.element ? "team" : "era");
      runtime.selectedRow = null;
      runtime.pendingPick = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      scheduleScan(80);
      // The current site resolves the booster request and retry animation in
      // separate React updates. Those changes are not always DOM mutations,
      // so make a few bounded follow-up scans instead of getting stuck idle.
      window.setTimeout(() => scheduleScan(0), 700);
      window.setTimeout(() => scheduleScan(0), 2_200);
      window.setTimeout(() => scheduleScan(0), 4_500);
      return;
    }

    const cardElement = event.target.closest?.(
      '[data-testid="player-card"],div[draggable]',
    );
    const cardRow = rowFromCard(cardElement);
    if (cardRow) runtime.selectedRow = cardRow;

    const position = inferPositionTarget(event.target);
    if (
      position &&
      runtime.selectedRow &&
      runtime.selectedRow.positions.includes(position) &&
      ![...parseTray().slots.keys()].includes(position)
    ) {
      runtime.pendingPick = {
        row: runtime.selectedRow,
        position,
        time: Date.now(),
      };
      scheduleScan(80);
    }
  }

  function handleDragStart(event) {
    const row = rowFromCard(
      event.target.closest?.('[data-testid="player-card"],div[draggable]'),
    );
    if (row) runtime.selectedRow = row;
  }

  function handleDrop(event) {
    const position = inferPositionTarget(event.target);
    if (position && runtime.selectedRow?.positions.includes(position)) {
      runtime.pendingPick = {
        row: runtime.selectedRow,
        position,
        time: Date.now(),
      };
      scheduleScan(80);
    }
  }

  function handleKeydown(event) {
    if (event.altKey && event.key.toLowerCase() === "a") {
      const state = readUiState();
      state.hidden = false;
      state.collapsed = !state.collapsed;
      writeUiState(state);
      getPanel();
      syncPanelState();
      event.preventDefault();
    }
  }

  function scheduleScan(delay = 140) {
    clearTimeout(runtime.scanTimer);
    runtime.scanTimer = window.setTimeout(scan, delay);
  }

  function scan() {
    runtime.scanSerial += 1;
    detectModeFromPage();
    if (!runtime.dataReady) {
      renderLoading(
        runtime.loadError || "Coach ready — start a draft and spin to load player stats.",
        Boolean(runtime.loadError),
      );
      return;
    }

    const cards = findCards();
    const cell = parseCell(cards);
    const trayState = reconcileRoster(cell);
    if (!readUiState().enabled) {
      cancelLiveAnalysis();
      clearHighlights();
      runtime.lastAdvice = null;
      runtime.analysisInProgressKey = "";
      return;
    }
    if (renderResultsIfPresent()) { cancelLiveAnalysis(); return; }
    if (!cell || !getPlayerListRoot() || !trayState.present) {
      cancelLiveAnalysis();
      clearHighlights();
      const waiting = /spinning|respinning/i.test(
        document.body?.innerText || "",
      )
        ? "Waiting for the roll…"
        : "Coach ready — start Classic, Hoop IQ, or 1v1.";
      renderPanel(
        `<div class="loading">${escapeHtml(waiting)}</div>`,
        `idle:${waiting}:${runtime.mode}`,
      );
      if (
        trayState.present &&
        document.querySelector('[data-testid="player-card"],div[draggable]') &&
        runtime.idleRecoveryScans < MAX_IDLE_RECOVERY_SCANS
      ) {
        runtime.idleRecoveryScans += 1;
        scheduleScan(500);
      }
      return;
    }
    runtime.idleRecoveryScans = 0;

    if (
      runtime.lastCell &&
      (runtime.lastCell.team !== cell.team || runtime.lastCell.era !== cell.era)
    ) {
      runtime.selectedRow = null;
      runtime.pendingPick = null;
      runtime.lastAdvice = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      runtime.analysisInProgressKey = "";
    }
    runtime.lastCell = cell;
    runtime.currentVisibleRows = [
      ...new Map(cards.map((card) => [card.row.key, card.row])).values(),
    ];
    const cellRows = currentRowsForCell(cell);
    runtime.lastOffers = new Map(cellRows.map((row) => [row.player, row]));
    for (const row of cellRows) runtime.recentOffers.set(row.player, row);
    if (runtime.recentOffers.size > 700) runtime.recentOffers.clear();

    const entries = currentEntries(trayState);
    if (entries.length < trayState.slots.size) {
      cancelLiveAnalysis();
      renderLoading(runtime.liveDataMode
        ? "Stats for a selected player are unavailable. Play Classic to save stats for future Hoop IQ games."
        : "Syncing your previously selected peaks…");
      return;
    }
    if (!lineupMatchesSnapshot(entries, trayState)) {
      cancelLiveAnalysis();
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      renderLoading("Updating lineup…");
      scheduleScan(120);
      return;
    }
    const openMask = FULL_POSITION_MASK & ~occupiedMask(entries);
    if (!openMask) { cancelLiveAnalysis(); return; }

    const retries = findRetryButtons();
    if (runtime.liveDataMode) {
      renderLiveAdvice(cell, entries, retries);
      return;
    }
    const shadowState = syncShadowToCell(cell);
    if (shadowState === "waiting") {
      renderAnalyzing();
      return;
    }
    const squadSignature = runtime.dealtCell?.squad
      ?.map((player) => String(player.player_id ?? player.id ?? player.name ?? ""))
      .sort()
      .join(",");
    const analysisKey = `${cell.team}|${cell.era}|squad:${squadSignature || cellRows.map((row) => row.id).sort().join(",")}|opp:${runtime.oneVsOneOpponent?.score ?? "-"}|${entries
      .map((entry) => `${entry.row.key}@${entry.position}`)
      .sort()
      .join(
        ";",
      )}|${retries.team.available ? 1 : 0}|${retries.era.available ? 1 : 0}|${
      runtime.shadowSynced && runtime.shadowSession
        ? `seed:${runtime.shadowSession.sessionId}:${runtime.shadowSession.rng.state}`
        : "forecast"
    }`;
    let analysis =
      runtime.lastAnalysisKey === analysisKey ? runtime.lastAnalysis : null;
    if (!analysis) {
      renderAnalyzing();
      runtime.lastAdvice = null;
      if (runtime.analysisInProgressKey !== analysisKey) {
        runtime.analysisInProgressKey = analysisKey;
        runtime.analysisGeneration += 1;
        const analysisGeneration = runtime.analysisGeneration;
        const stillCurrent = () =>
          runtime.analysisInProgressKey === analysisKey &&
          runtime.analysisGeneration === analysisGeneration &&
          readUiState().enabled;
        requestAnimationFrame(() => {
          window.setTimeout(async () => {
            if (!stillCurrent()) return;
            try {
              const limits = rolloutLimits();
              const currentDeadline =
                performance.now() +
                (runtime.mode === "1v1"
                  ? ONE_V_ONE_ANALYSIS_MAX_MS
                  : CURRENT_ANALYSIS_MAX_MS);
              const current = await forecastEvaluation(
                evaluateCell(cell, entries, true),
                entries,
                {
                  samples: limits.currentSamples,
                  maxActions: limits.currentActions,
                  seed: `pick:${cell.team}|${cell.era}:${entries
                    .map((entry) => entry.row.key)
                    .sort()
                    .join(";")}`,
                  retryCount:
                    Number(retries.team.available) +
                    Number(retries.era.available),
                  deadline: currentDeadline,
                  shouldContinue: stillCurrent,
                },
              );
              const teamRetry = retries.team.available
                ? await summarizeRetry(
                    "team",
                    cell,
                    entries,
                    Number(retries.era.available),
                    performance.now() +
                      (runtime.mode === "1v1"
                        ? ONE_V_ONE_ANALYSIS_MAX_MS / 2
                        : RETRY_ANALYSIS_MAX_MS),
                    stillCurrent,
                  )
                : null;
              const eraRetry = retries.era.available
                ? await summarizeRetry(
                    "era",
                    cell,
                    entries,
                    Number(retries.team.available),
                    performance.now() +
                      (runtime.mode === "1v1"
                        ? ONE_V_ONE_ANALYSIS_MAX_MS / 2
                        : RETRY_ANALYSIS_MAX_MS),
                    stillCurrent,
                  )
                : null;
              await yieldToBrowser(stillCurrent);
              const completed = {
                current,
                teamRetry,
                eraRetry,
                priorCeiling: runtime.optimizer.relaxedCeiling(
                  entries.map((entry) => entry.row),
                ),
                seededPlan:
                  runtime.shadowReady && runtime.shadowSynced
                    ? solveExactSeededPlan(entries)
                    : null,
              };
              if (!stillCurrent()) return;
              runtime.lastAnalysisKey = analysisKey;
              runtime.lastAnalysis = completed;
            } catch (error) {
              if (error?.name !== "AnalysisCancelledError") {
                console.error("[82-0 Coach] Analysis failed", error);
                runtime.loadError = `Analysis failed: ${error.message || error}`;
              }
            } finally {
              if (
                runtime.analysisInProgressKey === analysisKey &&
                runtime.analysisGeneration === analysisGeneration
              ) {
                runtime.analysisInProgressKey = "";
                scheduleScan(0);
              }
            }
          }, 0);
        });
      }
      return;
    }
    let { current } = analysis;
    const { teamRetry, eraRetry, priorCeiling, seededPlan } = analysis;
    let decision = null;
    if (seededPlan?.first) {
      if (seededPlan.first.retries.length) {
        const firstRetry = seededPlan.first.retries[0];
        decision = {
          kind: firstRetry,
          reason: `The exact seeded optimum is ${scoreText(seededPlan.result)} and starts with ${firstRetry.toUpperCase()} retry${seededPlan.first.retries.length > 1 ? `, then ${seededPlan.first.retries[1].toUpperCase()} retry` : ""}.`,
        };
      } else {
        const placement = shortestPlacementPlan(
          reachableRosterStates(entries),
          seededPlan.first.row,
          seededPlan.first.postMask,
          seededPlan.first.position,
        );
        if (
          placement &&
          movePlanUpgradesOccupiedPosition(
            entries,
            seededPlan.first.row,
            placement,
          )
        ) {
          current = {
            ...current,
            best: {
              row: seededPlan.first.row,
              position: seededPlan.first.position,
              moves: placement.moves,
              ceiling: seededPlan.result,
              immediate: calculateTeamResult([
                ...entries.map((entry) => entry.row),
                seededPlan.first.row,
              ]),
              seeded: true,
            },
          };
          decision = {
            kind: "pick",
            reason: `This pick leads to the exact seeded maximum: ${scoreText(seededPlan.result)}.`,
          };
        }
      }
    }
    if (!decision)
      decision = chooseAdvice(
        current,
        teamRetry,
        eraRetry,
        retries,
        priorCeiling,
        popcount(openMask),
      );
    const cellSignature = `${cell.team}|${cell.era}|${entries
      .map((entry) => `${entry.row.key}@${entry.position}`)
      .sort()
      .join(";")}|${decision.kind}`;
    const advice = {
      ...decision,
      cell,
      cellSignature,
      current,
      teamRetry,
      eraRetry,
      priorCeiling,
      seededPlan,
    };
    runtime.lastAdvice = advice;
    renderAdvice(advice, entries, cards, retries);
  }

  function startLoadingRows() {
    if (rowsLoadInProgress || runtime.liveDataMode) return;
    rowsLoadInProgress = true;
    loadRows()
      .catch((error) => {
        if (runtime.liveDataMode) return;
        console.error("[82-0 Coach] Failed to load player data", error);
        runtime.loadError = `Could not load player data: ${error.message || error}`;
      })
      .finally(() => {
        rowsLoadInProgress = false;
        scheduleScan(0);
      });
  }

  function bootstrap() {
    getPanel();
    window.addEventListener("pagehide", () => { cancelLiveAnalysis(); closeCoachWindow(); });
    window.addEventListener("pageshow", (event) => { if (event.persisted) scheduleScan(0); });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("drop", handleDrop, true);
    document.addEventListener("keydown", handleKeydown, true);
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    renderLoading("Coach ready — start a draft and spin to load player stats.");
    startLoadingRows();
    for (const entry of performance.getEntriesByType("resource"))
      discoverDatasetUrl(entry.name);
    if (typeof PerformanceObserver === "function") {
      const resources = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) discoverDatasetUrl(entry.name);
      });
      resources.observe({ type: "resource", buffered: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
