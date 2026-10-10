// ==UserScript==
// @name         82-0 Perfect Team Coach
// @namespace    https://82-0.com/
// @version      2.9.0
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

  const VERSION = "2.9.0";
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
  // BEGIN bundled reference stats
  // Source: https://82-0.vercel.app/players.json; verified 2026-10-10. Raw source SHA-256: 56401cfcef05cbf1b343934f64b681ff9616b64d9ff8107dc5778dd7976da0fa
  // 10626 factual stat rows; 180 team/era pools. Live/cached stats take priority.
  // Eligibility and selectable players always come from the actual server offer.
  const REFERENCE_STATS_DATE = "2026-10-10";
  const REFERENCE_STATS_CELLS = [
    ["ATL","1960s",[["Al Ferrari",7.19,2.3,3.03,null,null],["Barney Cable",8.26,6.47,1.33,null,null],["Bevo Nordmann",3.09,3.16,0.3,null,null],["Bill Bridges",12.6,11.99,2.73,null,null],["Bob Duffy",3.58,0.88,1.91,null,null],["Bob Ferry",5.9,3.8,0.6,null,null],["Bob Pettit",27.55,16.69,3.3,null,null],["Bob Sims",9.7,3.4,3.1,null,null],["Chico Vaughn",10.14,2.55,2.41,null,null],["Chuck Share",4.3,5.7,1.6,null,null],["Cleo Hill",5.5,3.1,2,null,null],["Cliff Hagan",18.62,6.31,3.23,null,null],["Clyde Lovellette",21.28,10,2.12,null,null],["Dave Gambee",5,3.7,0.7,null,null],["Dave Piontek",5.65,3.46,1.02,null,null],["Dennis Hamilton",3,1.2,0.3,null,null],["Dick Snyder",7.54,2.22,1.73,null,null],["Don Ohl",12.39,2.14,2.76,null,null],["Fred LaCour",6.85,3.49,1.96,null,null],["Gene Tormohlen",4.42,4.13,0.96,null,null],["George Lehmann",3.25,0.8,1.83,null,null],["Gerry Ward",1.8,0.9,0.9,null,null],["Jack McMahon",3.3,1,2,null,null],["Jeff Mullins",5.35,1.95,1.25,null,null],["Jim Davis",6.5,5.12,0.85,null,null],["Jim Washington",5.9,5.4,0.7,null,null],["Joe Caldwell",15.14,4.63,2.73,null,null],["John Barnhill",8.7,3.13,2.84,null,null],["Johnny McCarthy",7.89,4.02,4.89,null,null],["Larry Foust",9.06,6,1.18,null,null],["Lenny Wilkens",15.48,4.95,5.49,null,null],["Lou Hudson",18.46,5.6,1.83,null,null],["Mike Farmer",6.47,3.88,1.54,null,null],["Paul Silas",7.85,8.77,1.25,null,null],["Phil Jordon",6.5,4.4,1.4,null,null],["Richie Guerin",13.3,2.99,4.61,null,null],["Rod Thorn",8.8,2.4,1.8,null,null],["Shellie McMillon",11.8,6.3,1.1,null,null],["Si Green",7.74,4.3,2.67,null,null],["Slater Martin",6.2,2.9,5.2,null,null],["Tommy Kron",2.1,1.1,1.4,null,null],["Vern Hatton",7.2,2.3,2.2,null,null],["Walt Hazzard",11.2,3.3,5.9,null,null],["Woody Sauldsberry",7.18,6.05,0.94,null,null],["Zelmo Beaty",17.42,11.22,1.53,null,null]]],
    ["ATL","1970s",[["Armond Hill",8.64,2.2,5.37,1.33,0.17],["Bill Bridges",13.05,14.61,3.5,null,null],["Bill Willoughby",4.78,4.52,0.42,0.56,0.54],["Bob Christian",3.37,4,0.67,null,null],["Bob Kauffman",3.9,2.5,1.1,0.3,0.1],["Butch Beard",7,1.9,1.7,null,null],["Butch Lee",7.7,1.2,3.4,1.1,0],["Charlie Criss",8.89,1.39,3.31,1.15,0.1],["Claude Terry",4.38,0.88,0.85,0.38,0.03],["Connie Hawkins",8.2,6,2.9,1.1,0.6],["Dale Schlueter",2.9,2.7,0.8,0.4,0.4],["Dan Roundfield",15.3,10.8,1.6,1.1,2.2],["Dave Newmark",4.9,2.7,0.7,null,null],["Dean Meminger",7.03,2.47,4.22,1.18,0.1],["Don Adams",11.38,7.01,1.96,null,null],["Don May",6.88,2.66,0.7,null,null],["Don Ohl",6.2,1.1,1.5,null,null],["Dwight Jones",9.48,7.77,1.51,0.63,0.83],["Eddie Johnson",13.23,2.05,3.79,1.45,0.1],["Eddie Mast",2.8,3.2,0.9,null,null],["Gary Gregor",8.1,4.9,0.8,null,null],["George Trapp",9.24,4.67,1.29,null,null],["Herb White",2.4,1.3,1.2,null,null],["Herm Gilliam",12.48,4.32,4.92,1.76,0.25],["Jack Givens",7.7,2.9,1.1,1,0.2],["Jeff Halliburton",4.39,1.04,0.78,null,null],["Jerry Chambers",8.9,3.8,0.9,null,null],["Jim Creighton",1,1.4,0.1,0.1,0.3],["Jim Davis",10.41,7.89,2.01,null,null],["Jim Washington",10.4,9.24,2.03,0.67,0.76],["Joe Caldwell",21.1,5,3.5,null,null],["Joe Meriweather",11.1,8.1,1.1,0.6,1.1],["John Brown",8.26,4.81,1.54,0.6,0.16],["John Drew",22,8.47,1.79,1.6,0.38],["John Tschogl",2.14,1.32,0.51,0.3,0.3],["John Vallely",4.03,0.77,0.91,null,null],["John Wetzel",3.66,2.11,1.58,0.91,0.21],["Ken Charles",10.67,1.82,3.66,1.6,0.44],["Larry Siegfried",3.3,1.5,2.5,null,null],["Len Chappell",4.8,3.2,0.4,null,null],["Lou Hudson",23.41,4.66,3.29,1.71,0.29],["Mike Sojourner",8.69,6.49,0.92,0.48,0.57],["Ollie Johnson",8.5,3.2,1.5,1,0.4],["Pete Maravich",24.24,4.23,5.6,1.5,0.2],["Randy Denton",5.3,4.8,0.7,0.3,0.4],["Rick Wilson",3,1.2,1.2,0.5,0.1],["Ron Behagen",11,6.7,1.3,1.2,0.5],["Steve Bracey",6.91,1.71,2.47,0.8,0.1],["Steve Hawes",10.82,7.7,2.18,0.96,0.65],["Terry Furlow",9.9,2.4,2.8,0.6,0.4],["Tom Barker",8.1,6.8,1,0.6,0.7],["Tom Henderson",12.48,2.94,5.22,1.55,0.12],["Tom Ingelsby",2.7,0.9,0.8,0.4,0.1],["Tom McMillen",8.31,4.95,0.98,0.34,0.31],["Tom Van Arsdale",14.85,2.94,2.34,0.95,0.05],["Tony Robertson",5.9,1.1,1.6,1.2,0.1],["Tree Rollins",8,7.1,0.8,0.65,2.9],["Truck Robinson",22.4,12.8,2.7,1.1,0.6],["Walt Bellamy",15.64,12.19,2.81,0.7,0.6],["Walt Hazzard",15.9,3.85,6.55,null,null],["Wilbur Holland",5.8,1.2,0.8,0.6,0.1]]],
    ["ATL","1980s",[["Antoine Carr",7.43,3.31,1.07,0.4,0.94],["Armond Hill",5.48,1.65,4.9,1.22,0.09],["Billy Paultz",2.2,2.8,0.5,0.2,0.2],["Charlie Criss",8.43,1.47,3.45,0.87,0.01],["Chris Washburn",2,1.9,0.1,0.1,0.3],["Cliff Levingston",9.25,6.58,0.91,0.84,0.82],["Craig Shelton",4.1,2.38,0.47,0.3,0.09],["Dan Roundfield",18.09,10.68,2.59,1,1.51],["Doc Rivers",12.6,3.51,7.38,2.08,0.47],["Dominique Wilkins",26.03,6.77,2.43,1.46,0.73],["Don Collins",12.7,4,2.4,1.5,0.2],["Duane Ferrell",2.4,1,0.2,0.2,0.1],["Dudley Bradley",1.9,0.8,0.6,0.4,0.1],["Eddie Johnson",16.34,2.38,5.66,1.14,0.14],["Freeman Williams",4.8,0.5,0.8,0.3,0],["George Johnson",1.7,3.2,0.5,0.3,1.6],["Gus Williams",4.2,1.2,4.2,0.5,0.2],["Jack Givens",5.7,3,0.7,0.6,0.2],["Jim McElroy",4.85,1.11,1.82,0.49,0.2],["John Battle",7.76,1.35,2.01,0.48,0.08],["John Brown",3.9,2.2,0.5,0.1,0.1],["John Drew",19.86,5.68,1.3,1.16,0.17],["Johnny Davis",11.29,1.86,4.81,0.75,0.08],["Jon Koncak",6.16,6.08,0.59,0.61,1.01],["Keith Edmonson",3.5,1.2,0.7,0.3,0.2],["Kevin Willis",12.33,8.21,0.53,0.72,0.6],["Lorenzo Charles",3.4,1.1,0.2,0.1,0.2],["Mark Landsberger",1.5,3.4,0.3,0.2,0.1],["Mike Glenn",8.01,1.28,1.91,0.5,0.08],["Mike McGee",9.67,2.02,1.9,0.76,0],["Moses Malone",20.2,11.8,1.4,1,1.2],["Randy Wittman",9.98,1.72,2.88,0.59,0.16],["Ray Tolbert",2.1,1.8,0.3,0.3,0.3],["Reggie Theus",15.8,3,4.7,1.3,0.2],["Rickey Brown",3.4,3.02,0.38,0.28,0.28],["Ron Lee",2.2,1.1,2.2,0.5,0.1],["Rory Sparrow",11.29,2.77,5.09,1.21,0.13],["Rudy Macklin",6.52,2.96,0.79,0.55,0.2],["Sam Pellom",4.47,3.51,0.48,0.45,0.8],["Scott Hastings",3.14,2.46,0.49,0.33,0.29],["Sly Williams",11.14,4.6,2.36,0.88,0.17],["Spud Webb",5.99,1.65,4.1,0.91,0.1],["Steve Hawes",9.31,6.39,2.07,0.84,0.42],["Terry Furlow",8.4,2,3.4,0.9,0.4],["Tom Burleson",3.3,3,0.4,0.3,0.6],["Tom McMillen",8.55,4.02,1.28,0.38,0.32],["Tree Rollins",6.7,7.42,0.67,0.54,2.78],["Walker Russell",4,1.9,3.1,0.8,0.2],["Wes Matthews",8.22,1.47,4.12,1.16,0.1]]],
    ["ATL","1990s",[["Adam Keefe",5.6,4.39,0.78,0.53,0.16],["Alan Henderson",10.02,5.39,0.81,0.67,0.46],["Alexander Volkov",6.86,2.58,2.23,0.71,0.35],["Andrew Lang",9.09,5.13,0.86,0.55,1.51],["Anthony Johnson",5,1.5,2.2,0.7,0.1],["Anthony Miller",2.04,2.03,0.1,0.39,0.1],["Antoine Carr",7.6,3.4,1.2,0.3,0.8],["Blair Rasmussen",7.76,4.39,1.07,0.36,0.58],["Chris Crawford",5.39,1.56,0.4,0.25,0.25],["Christian Laettner",15.76,7.78,2.6,1.09,0.9],["Chucky Brown",5,2.4,0.7,0.3,0.2],["Cliff Levingston",6.9,4.3,1.1,0.7,0.5],["Craig Ehlo",9.37,3.23,2.46,1.29,0.18],["Danny Manning",15.7,6.5,3.3,1.8,1],["Dikembe Mutombo",12.75,11.66,1.17,0.45,3.24],["Doc Rivers",14.18,3.58,4.75,2.09,0.56],["Dominique Wilkins",27.04,7.21,2.99,1.35,0.58],["Donnie Boyce",2.63,0.86,0.55,0.47,0.17],["Doug Edwards",2.07,1.24,0.36,0.1,0.16],["Drew Barry",2.1,1.3,1.8,0.4,0],["Duane Ferrell",8.57,2.29,1.1,0.57,0.24],["Ed Gray",6.25,1.2,0.75,0.45,0.2],["Eldridge Recasner",7.33,1.96,1.62,0.59,0.05],["Ennis Whatley",3.35,1.18,2.15,0.7,0],["Grant Long",11.79,7.94,1.71,1.29,0.38],["Greg Anderson",2.36,3.06,0.3,0.45,0.4],["Greg Foster",3.1,1.7,0.3,0.1,0.3],["Henry James",6.7,1.5,0.4,0.2,0],["Ivano Newbill",1.4,2.8,0.3,0.4,0.2],["Jeff Sanders",3.39,2.63,0.76,0.61,0.21],["Jim Les",2.1,1.1,1.8,0.2,0],["John Battle",12.43,1.87,2.66,0.56,0.1],["John Long",8.4,1.7,1.8,0.9,0.1],["Jon Barry",4.9,1.7,2,0.9,0.1],["Jon Koncak",3.61,4.3,1.31,0.79,1.04],["Ken Norman",10.46,4.27,1.38,0.46,0.34],["Kenny Smith",7.7,1.1,4.3,0.7,0],["Kevin Willis",16.18,11.47,1.6,0.88,0.57],["LaPhonso Ellis",10.2,5.5,0.9,0.4,0.4],["Mark West",1.2,2.6,0.3,0.1,0.4],["Matt Bullard",3.8,1.3,0.4,0.4,0.2],["Maurice Cheeks",4.6,1.7,3.3,1.5,0],["Mookie Blaylock",14.98,4.65,7.26,2.54,0.31],["Morlon Wiley",3.6,1.59,3.52,0.94,0.11],["Moses Malone",14.72,9.04,1.2,0.5,0.95],["Paul Graham",8.35,2.45,1.97,1.04,0.2],["Priest Lauderdale",3.2,1.2,0.3,0,0.3],["Reggie Jordan",3.9,2.2,1.2,0.5,0.3],["Rodney Monroe",3.4,0.9,0.7,0.3,0.1],["Roshown McLeod",4.8,1.5,0.4,0.1,0],["Rumeal Robinson",10.28,2.26,4.51,1.08,0.26],["Sedric Toney",2.8,0.4,1.6,0.3,0],["Sidney Moncrief",4.7,1.8,1.4,0.7,0.1],["Spud Webb",9.91,2.11,4.97,1.21,0.08],["Stacey Augmon",13.74,4.52,2.3,1.45,0.4],["Steve Henson",4,1,2.9,0.6,0],["Steve Smith",18.58,3.82,3.55,0.91,0.32],["Tim McCormick",4.5,2.9,0.6,0.2,0.3],["Todd Mundt",1.3,1,0.1,0,0.2],["Travis Mays",7.06,1.1,1.46,0.38,0.1],["Trevor Wilson",2.2,1.6,0.4,0.2,0],["Tyrone Corbin",8.4,3.84,1.47,1.02,0.13],["Willie Burton",6.2,1.7,0.5,0.3,0.1]]],
    ["ATL","2000s",[["Acie Law",3.56,1.05,1.8,0.35,0.05],["Al Harrington",18.09,6.95,3.15,1.19,0.2],["Al Horford",10.73,9.52,1.91,0.75,1.13],["Alan Henderson",8.96,5.58,0.66,0.66,0.51],["Anthony Johnson",4.85,1.6,3.19,0.75,0.15],["Antoine Walker",20.4,9.4,3.7,1.2,0.6],["Bimbo Coles",8.1,2.2,3.6,0.7,0.1],["Bob Sura",14.7,8.3,5.3,0.9,0.2],["Boris Diaw",4.64,3.62,2.35,0.71,0.41],["Brevin Knight",6.9,3.4,6.1,2,0.1],["Cal Bowdler",3,1.91,0.2,0.27,0.33],["Chris Crawford",7.18,2.43,0.71,0.46,0.36],["Dan Dickau",3.2,0.84,1.42,0.33,0],["Darvin Ham",2.4,2,0.5,0.2,0.3],["DerMarr Johnson",6.68,2.83,0.94,0.74,0.59],["Dikembe Mutombo",10.6,14.1,1.23,0.34,3.11],["Dion Glover",8.47,3.14,1.6,0.8,0.23],["Donta Smith",2.7,1.1,0.77,0.49,0.06],["Emanual Davis",5.26,2.23,1.98,0.77,0.15],["Esteban Batista",1.74,2.46,0.14,0.28,0.16],["Glenn Robinson",20.8,6.6,3,1.3,0.4],["Hanno Möttölä",4.61,2.88,0.46,0.2,0.15],["Ira Newble",7.81,4.28,1.29,0.77,0.44],["Isaiah Rider",19.3,4.3,3.7,0.7,0.1],["Jacque Vaughn",5.3,1.81,3.56,0.71,0],["Jason Collier",6.94,3.27,0.43,0.29,0.29],["Jason Terry",16.21,3.26,5.54,1.46,0.16],["Jeremy Richardson",1.6,0.4,0,0.12,0],["Jermaine Jackson",1.9,1.1,1.2,0.3,0.1],["Jim Jackson",16.28,4.93,2.9,0.77,0.12],["Joe Johnson",21.84,4.31,5.73,1.13,0.25],["John Edwards",1.8,1.2,0.1,0.1,0.4],["Josh Childress",11.09,5.54,1.84,1.02,0.54],["Josh Smith",14.02,7.36,2.65,1.18,2.38],["Kenny Anderson",5,2.1,2.5,0.8,0],["Kevin Willis",3,2.6,0.3,0.3,0.2],["LaPhonso Ellis",8.4,5,1,0.6,0.4],["Larry Robinson",6,2.6,1.1,0.8,0.1],["Lee Nailon",5.3,2.3,0.6,0.4,0.3],["Lorenzen Wright",6.72,4.83,0.67,0.45,0.58],["Mamadou N'Diaye",3.9,4.4,0,0.3,1],["Mario West",0.85,0.94,0.29,0.25,0.1],["Mark Strickland",4.5,2.8,0.4,0.4,0.4],["Marvin Williams",12.47,5.49,1.41,0.82,0.44],["Matt Maloney",5.69,1.78,2.48,0.86,0.08],["Maurice Evans",7.2,3,0.7,0.6,0.1],["Mike Bibby",14.66,3.41,5.44,1.17,0.1],["Nazr Mohammed",8.31,6.54,0.39,0.64,0.67],["Obinna Ekezie",5.5,4.3,0.3,0.5,0.3],["Predrag Drobnjak",8.4,3.4,0.7,0.6,0.3],["Randolph Morris",0.8,0.9,0.1,0.1,0],["Ronald Murray",12.2,2.1,2,1.1,0.2],["Roshown McLeod",8.38,3.27,1.42,0.53,0.14],["Royal Ivey",3.4,1.25,1.17,0.46,0.1],["Salim Stoudamire",8.03,1.36,1.03,0.32,0.02],["Shareef Abdur-Rahim",20.42,8.85,2.89,1.1,0.69],["Shelden Williams",4.73,4.66,0.44,0.54,0.44],["Solomon Jones",2.66,2.05,0.16,0.14,0.48],["Speedy Claxton",5.17,1.81,4.27,1.62,0.1],["Stephen Jackson",18.1,4.6,3.1,1.8,0.3],["Theo Ratliff",8.55,7.34,0.93,0.65,3.15],["Tom Gugliotta",7.9,5.5,2.1,1.2,0.5],["Toni Kukoč",12.09,4.15,4.18,0.8,0.3],["Tony Delk",11.73,2.29,1.87,0.79,0.1],["Travis Hansen",3,1.7,0.5,0.2,0.2],["Tyronn Lue",11.03,1.77,3.62,0.44,0.03],["Zaza Pachulia",8.96,6.23,1.15,0.79,0.38]]],
    ["ATL","2010s",[["Al Horford",15.57,8.7,3.02,0.86,1.23],["Alex Len",11.1,5.5,1.1,0.4,0.9],["Alex Poythress",5.1,3.6,0.8,0.2,0.5],["Anthony Morrow",5.2,1.1,0.4,0.5,0],["Anthony Tolliver",4.1,2.5,0.5,0.2,0.2],["Cartier Martin",5.9,2,0.6,0.5,0.1],["Dahntay Jones",3.1,1.1,0.7,0.4,0],["Damien Wilkins",3.5,1.7,0.8,0.5,0.2],["DeAndre' Bembry",6.35,3.39,1.92,0.92,0.4],["DeMarre Carroll",11.83,5.4,1.75,1.4,0.25],["DeShawn Stevenson",5.1,2.2,0.9,0.5,0.1],["Dennis Schröder",12.91,2.5,4.76,0.79,0.11],["Devin Harris",9.9,2,3.4,1.1,0.2],["Dewayne Dedmon",10.41,7.7,1.45,0.85,0.95],["Dwight Howard",13.5,12.7,1.4,0.9,1.2],["Elton Brand",4.71,4.21,0.87,0.5,1.03],["Ersan İlyasova",10.72,5.61,1.32,0.93,0.36],["Gustavo Ayón",4.3,4.8,1.1,1,0.4],["Isaiah Taylor",6.6,1.4,3.1,0.5,0.1],["Ivan Johnson",6.51,3.94,0.66,0.8,0.24],["Jamal Crawford",16.14,2.11,3.1,0.8,0.2],["Jannero Pargo",5.53,1.44,2,0.4,0],["Jason Collins",1.49,1.6,0.32,0.15,0.15],["Jaylen Adams",3.2,1.8,1.9,0.4,0.1],["Jeff Teague",12.15,2.15,5.15,1.18,0.35],["Jeremy Lin",10.7,2.3,3.5,0.7,0.1],["Jerry Stackhouse",3.6,0.8,0.5,0.3,0.1],["Joe Johnson",19.51,4.13,4.54,0.88,0.13],["Joe Smith",3,2.5,0.3,0.1,0.3],["Johan Petro",3.5,3.6,0.5,0.3,0.3],["John Collins",14.57,8.43,1.62,0.51,0.87],["John Jenkins",5.58,1.55,0.79,0.24,0.14],["Josh Powell",4.1,2.5,0.4,0.1,0.1],["Josh Smith",17.04,8.77,3.9,1.38,1.81],["Justin Anderson",3.7,1.8,0.5,0.5,0.3],["Justin Holiday",2.4,1,0.4,0.5,0.2],["Kent Bazemore",10.36,3.8,2.27,1.19,0.58],["Kevin Huerter",9.7,3.3,2.9,0.9,0.3],["Kirk Hinrich",6.37,2,2.75,0.72,0.22],["Kris Humphries",5.09,3.62,0.53,0.35,0.37],["Kyle Korver",10.86,3.74,2.38,0.83,0.45],["Lamar Patterson",2.33,1.4,1.11,0.29,0.09],["Lou Williams",11.86,2.1,3.54,0.92,0.18],["Luke Babbitt",6.1,2.2,0.7,0.2,0.1],["Malcolm Delaney",5.78,1.79,2.77,0.54,0.04],["Marco Belinelli",11.4,1.9,2,0.9,0.1],["Mario West",0.8,0.7,0.2,0.2,0],["Marvin Williams",10.22,5.03,1.22,0.7,0.45],["Maurice Evans",5.25,1.86,0.6,0.36,0.16],["Mike Bibby",9.22,2.42,3.78,0.76,0.04],["Mike Dunleavy",5.6,2.3,1,0.3,0.2],["Mike Muscala",5.38,3.12,0.9,0.38,0.53],["Mike Scott",7.09,2.98,0.89,0.32,0.11],["Miles Plumlee",4.32,3.63,0.82,0.3,0.43],["Omari Spellman",5.9,4.2,1,0.6,0.5],["Paul Millsap",17.43,8.28,3.29,1.66,1.17],["Pero Antić",6.28,3.53,0.98,0.34,0.2],["Randolph Morris",2.2,1.4,0.1,0.2,0.1],["Shelvin Mack",6.06,1.65,2.94,0.56,0],["Taurean Prince",11.4,3.79,1.95,0.91,0.44],["Thabo Sefolosha",6.36,4.41,1.5,1.2,0.47],["Tiago Splitter",5.6,3.3,0.8,0.6,0.3],["Tim Hardaway Jr.",11.32,2.37,1.79,0.58,0.16],["Tracy McGrady",5.3,3,2.1,0.3,0.3],["Trae Young",19.1,3.7,8.1,0.9,0.2],["Tyler Cavanaugh",4.7,3.3,0.7,0.2,0.1],["Tyler Dorsey",5.93,2.07,1.14,0.3,0.07],["Vince Carter",7.4,2.6,1.1,0.6,0.4],["Vladimir Radmanović",4.5,2.9,1.1,0.4,0.3],["Willie Green",7.6,1.5,0.8,0.4,0.1],["Zaza Pachulia",5.4,5.33,0.95,0.6,0.35]]],
    ["ATL","2020s",[["Lou Williams",8.8,1.9,2.6,0.6,0.1],["Danilo Gallinari",12.5,4.4,1.5,0.5,0.2],["Wesley Matthews",3.1,1.5,0.6,0.4,0.3],["CJ McCollum",18.7,3.3,3.9,0.8,0.5],["Gorgui Dieng",3.5,2.8,0.8,0.3,0.3],["Tony Snell",5.3,2.4,1.3,0.3,0.2],["Solomon Hill",2.5,2.4,1,0.5,0.2],["Clint Capela",11.7,11.3,1,0.7,1.4],["Bogdan Bogdanović",15.6,3.5,3.1,1.1,0.3],["Delon Wright",4.4,2.9,2.4,1.2,0.2],["Larry Nance Jr.",8.5,4.3,1.6,0.8,0.5],["Kris Dunn",1.3,1.5,0.5,0.5,0.5],["Buddy Hield",7.6,2.3,1.4,0.8,0.2],["Caris LeVert",12.1,3.2,3.4,0.9,0.5],["Dejounte Murray",21.5,5.3,6.2,1.4,0.3],["Cat Barber",0,1,1,0,0],["Georges Niang",9.9,3.4,1.4,0.4,0.2],["Timothe Luwawu-Cabarrot",4.4,1.6,0.8,0.3,0.1],["John Collins",15.6,7.2,1.4,0.6,1],["Tony Bradley",4,2.8,0.5,0.1,0.2],["Wes Iwundu",7.3,4.3,0,0.3,0],["Cameron Oliver",11.5,3,1.5,0.5,0.5],["Bruno Fernando",3.9,3.4,0.7,0.3,0.5],["Aaron Holiday",3.9,1.2,1.4,0.6,0.2],["Kevin Huerter",12,3.3,3.1,0.9,0.3],["Kevin Knox II",3.1,1.5,0.3,0.1,0.1],["Trae Young",26,3.3,10.3,1.1,0.2],["Jock Landale",10.6,5.7,1.7,0.5,0.5],["Brandon Goodwin",4.9,1.5,2,0.4,0],["Gabe Vincent",4.4,1,1.4,0.5,0.1],["Terance Mann",7.7,3,1.8,0.7,0.2],["Cam Reddish",11.2,4,1.3,1.3,0.3],["De'Andre Hunter",14.8,4,1.5,0.7,0.4],["Jarrett Culver",4.4,3.8,0.6,0.6,0.2],["Nickeil Alexander-Walker",20.8,3.4,3.7,1.3,0.5],["Dylan Windler",2.5,0.9,0.6,0.1,0],["Garrison Mathews",5.7,1.6,0.8,0.4,0.2],["Chris Silva",2,0,0,0,0],["Onyeka Okongwu",10.2,6.6,1.5,0.7,1.1],["Saddiq Bey",13.8,5.6,1.5,0.9,0.2],["Skylar Mays",3.3,1,0.8,0.3,0.1],["Jonathan Kuminga",12.2,5.6,2.3,0.6,0.3],["Nathan Knight",3.8,2.2,0.2,0.3,0.3],["Trent Forrest",2.2,1.5,2,0.3,0.1],["Vít Krejčí",4.8,2,1.8,0.5,0.3],["Sharife Cooper",0.5,0.4,0.4,0,0],["Jalen Johnson",13.1,6.8,3.6,0.9,0.6],["Corey Kispert",9.2,2.3,1.6,0.3,0.2],["Chaundee Brown Jr.",6.2,3.2,0.8,0.4,0],["Dyson Daniels",13,6.3,5.2,2.5,0.6],["Keaton Wallace",4.5,1.4,2.2,0.7,0.2],["AJ Griffin",5.7,1.5,0.7,0.3,0.2],["Christian Koloko",2.7,3,0.7,0.5,0.9],["Jacob Toppin",1.5,0.6,0.3,0.1,0.1],["Tyrese Martin",1.3,0.8,0.1,0.1,0],["Caleb Houstan",2.3,0.6,0.2,0.1,0.1],["Dominick Barlow",4.2,2.4,0.5,0.3,0.5],["Mouhamed Gueye",4.8,3.8,0.8,0.8,0.7],["Daeqwon Plowden",7.2,1.8,0.3,0,0],["Donovan Williams",2,1,0,0,0],["Kobe Bufkin",5,2,1.6,0.3,0.2],["Seth Lundy",1.6,0.8,0,0,0],["Zaccharie Risacher",11.1,3.7,1.1,0.8,0.5],["N'Faly Dante",0.8,1.8,0,0.5,0],["RayJ Dennis",4.4,1.5,1.9,0.2,0.2],["Asa Newell",5.2,2.2,0.6,0.4,0.3],["Keshon Gilbert",4.3,1.3,3,0.8,1]]],
    ["BKN","1970s",[["Al Skinner",11.8,4.15,3.39,1.26,0.57],["Bernard King",22.88,8.84,3.01,1.45,0.5],["Bird Averitt",8.3,1.6,3.2,0.8,0],["Bob Carrington",10.4,3,1.5,1.2,0.3],["Bubbles Hawkins",17.42,3.07,1.96,1.5,0.59],["Chuck Terry",5,2.3,0.6,1,0.2],["Darnell Hillman",13.1,7.5,1.1,1.1,1],["Dave Wohl",6.57,1.74,2.95,0.93,0.16],["Eddie Jordan",11.48,2.41,3.85,2.38,0.46],["Eric Money",16.7,2.7,5.3,1.6,0.2],["George Johnson",7.67,8.77,1.25,0.95,3.3],["Harvey Catchings",6.1,6.4,0.9,0.5,1.8],["Howard Porter",12.8,4.8,0.7,0.5,0.6],["Jan van Breda Kolff",7.13,4.95,1.82,0.97,0.84],["Jim Fox",6.5,4.6,0.7,0.3,0.4],["John Williamson",23.42,2.79,2.83,1.3,0.19],["Kevin Porter",16.2,2.7,10.8,1.6,0.2],["Kim Hughes",3.26,5.9,1,1.25,1.25],["Louie Nelson",8.5,2,1.2,0.8,0.2],["Mel Davis",8.7,5.7,1.4,0.6,0.1],["Mike Bantom",18.6,8.6,1.5,0.8,0.8],["Phil Jackson",6.3,3,1.4,0.8,0.4],["Ralph Simpson",6.9,1.9,2.1,0.4,0.1],["Rich Jones",10.6,5.7,1.4,1.1,0.3],["Tim Bassett",6.08,6.55,1.21,0.92,0.53],["Tiny Archibald",20.5,2.4,7.5,1.7,0.3],["Wilson Washington",8.3,5.03,0.69,0.56,1.21],["Winford Boynes",9.3,2.2,1.1,0.6,0.1]]],
    ["BKN","1980s",[["Adrian Branch",6.7,2.4,0.8,0.8,0.6],["Albert King",13.62,4.62,2.41,0.94,0.41],["Ben Coleman",7.85,4.83,0.76,0.64,0.53],["Bill Jones",3.5,1.3,0.5,0.5,0.2],["Bill Willoughby",4.23,2.67,0.8,0.27,0.36],["Bob Elliott",6.73,3.51,1.46,0.5,0.24],["Bobby Cattage",3.2,1.2,0.1,0.2,0],["Buck Williams",16.46,11.93,1.54,0.95,1.08],["Calvin Natt",19.7,9.7,2.1,1.5,0.4],["Charles Shackleford",3.1,2.6,0.4,0.3,0.3],["Chris Engler",2.04,1.99,0.25,0.21,0.24],["Chris Morris",14.1,5.2,1.6,1.3,0.8],["Cliff Robinson",16.39,7.39,1.54,0.9,0.64],["Corey Gaines",2.1,0.6,2.1,0.5,0],["Dallas Comegys",5.6,2.9,0.9,0.5,0.9],["Darryl Dawkins",14.33,5.47,1.4,0.6,1.52],["Darwin Cook",10.16,2.26,4.25,1.9,0.38],["Dennis Hopson",11.16,2.8,1.8,1,0.45],["Dudley Bradley",6.7,2,2.4,1.8,0.7],["Eddie Jordan",12.26,3.01,6.29,2.55,0.27],["Eddie Phillips",3.2,1.6,0.6,0.3,0.2],["Edgar Jones",8.7,4.4,0.7,0.6,1.4],["Foots Walker",4.87,1.79,4.32,1.19,0.05],["George Johnson",4.71,5.35,1.3,0.52,2.31],["James Bailey",8.4,4.52,0.71,0.51,0.92],["Jan van Breda Kolff",4.73,3.23,1.95,0.71,0.63],["Jeff Turner",5.1,2.74,0.92,0.4,0.14],["Joe Barry Carroll",14.1,7.4,1.6,1.1,1.3],["John Bagley",9.91,2.65,5.8,1.21,0.1],["John Williamson",17.7,1.9,3.1,0.9,0.3],["Keith Lee",4.8,4.5,0.7,0.4,0.6],["Kelvin Ransey",8.61,1.57,4.54,0.94,0.1],["Kevin McKenna",6,1.37,1.67,0.87,0.13],["Kevin Williams",4.3,1.2,0.9,0.6,0.2],["Len Elmore",6.38,4.35,0.87,0.86,0.81],["Leon Wood",7.3,1.6,4.9,0.6,0],["Lester Conner",10.3,4.3,7.4,2.2,0.1],["Lowes Moore",7,2.4,3.2,0.9,0.2],["Maurice Lucas",14.82,8.77,2.82,0.82,0.97],["Mickey Johnson",9.74,4.58,2.94,0.97,0.37],["Mike Gminski",11.68,6.68,1.29,0.59,1.12],["Mike McGee",13,2.4,1.5,1,0.2],["Mike Newlin",21.15,3.1,3.9,1.3,0.1],["Mike O'Koren",8.48,3.52,2.16,0.78,0.23],["Orlando Woolridge",19.83,4.88,3.54,0.7,1.1],["Otis Birdsong",15.93,2.5,3.64,1.13,0.19],["Pace Mannion",3.6,1.7,2,0.8,0.2],["Pearl Washington",8.94,1.75,3.62,1.3,0.1],["Ray Williams",16.99,3.41,5.77,2.02,0.43],["Reggie Johnson",4.8,1.9,0.6,0.3,0.3],["Rich Kelley",10,7,2.2,0.9,1.4],["Robert Smith",5.2,1.3,1.4,0.4,0.1],["Roger Phegley",11.7,2.5,1.1,0.5,0.1],["Roy Hinson",16.59,6.73,1.12,0.58,1.5],["Sam Lacey",2.9,1.9,1.4,0.4,0.7],["Sleepy Floyd",5.3,1,1.6,0.4,0.2],["Tim McCormick",14.1,6.9,2,0.4,0.3],["Tony Brown",11.3,2.8,3.4,1.2,0.2],["Walter Berry",8.9,4,0.7,0.3,0.4],["Wayne Sappleton",2.9,2.3,0.2,0.2,0.1],["Winford Boynes",8.5,2.1,1.5,0.9,0.3]]],
    ["BKN","1990s",[["Anthony Mason",1.8,1.6,0.3,0.1,0.1],["Armen Gilliam",14.91,7.54,1.26,0.73,0.84],["Benoit Benjamin",10.1,6.81,0.6,0.46,1.11],["Bernard King",7,2.4,0.6,0.3,0.1],["Brian Evans",3.71,1.79,1.01,0.3,0.23],["Charles Shackleford",8.2,6.8,0.8,0.6,0.5],["Chris Carr",6.6,2.1,0.6,0.3,0],["Chris Childs",9.97,2.37,5.83,1.16,0.1],["Chris Dudley",5.42,8.22,0.53,0.47,1.95],["Chris Gatling",10.14,5.42,0.86,0.8,0.41],["Chris Morris",13.1,5.82,2.09,1.57,0.95],["Chucky Brown",5.1,3,0.7,0.3,0.3],["Dave Feitl",2.4,1.8,0.2,0.1,0.1],["David Benoit",5.3,2.7,0.3,0.5,0.3],["David Vaughn",3.1,3.34,0.1,0.26,0.5],["David Wesley",3.1,0.7,2.1,0.6,0.1],["Dennis Hopson",15.8,3.5,1.9,1.3,0.6],["Derrick Coleman",19.9,10.62,3.14,0.92,1.6],["Derrick Gervin",8.8,2.3,0.47,0.49,0.3],["Doug Lee",2.44,0.76,0.55,0.18,0.02],["Dražen Petrović",19.45,2.74,2.89,1.21,0.11],["Dwayne Schintzius",2.08,2.3,0.34,0.16,0.48],["Ed O'Bannon",5.37,2.56,0.83,0.62,0.2],["Elliot Perry",2.6,0.9,1.2,0.5,0],["Eric Montross",5.1,9.1,0.9,0.4,1.3],["Greg Graham",4.1,0.9,0.9,0.4,0],["Jack Haley",4.91,4.03,0.35,0.25,0.22],["Jamie Feick",6.8,11,0.9,1,0.7],["Jaren Jackson",2.4,0.9,0.5,0.5,0],["Jayson Williams",8.26,8.93,0.7,0.45,0.73],["Jim Jackson",16.5,5.9,5.2,0.9,0.5],["Jim McIlvaine",2.2,2.5,0.1,0.4,1.5],["Joe Barry Carroll",8.8,5.4,0.9,0.4,1.2],["Joe Kleine",3,4.1,0.8,0.3,0.4],["Johnny Newman",9.5,1.9,0.7,0.8,0.3],["Jud Buechler",3.12,1.88,0.71,0.42,0.21],["Keith Van Horn",20.55,7.37,1.62,1,0.76],["Kendall Gill",16.32,5.25,3.08,2.08,0.63],["Kenny Anderson",15.33,3.38,7.79,1.54,0.19],["Kerry Kittles",15.92,4.27,2.62,1.78,0.48],["Kevin Edwards",10.68,2.47,2.18,1.24,0.26],["Khalid Reeves",6.58,1.61,2.67,0.58,0.1],["Kurk Lee",1.4,0.6,0.7,0.2,0],["Leon Wood",1.8,0.4,1.7,0.2,0],["Lester Conner",6.76,2.72,3.8,1.8,0.07],["Lucious Harris",4.47,1.38,0.84,0.67,0.14],["Mark Hendrickson",5.5,3.1,0.6,0.5,0],["Maurice Cheeks",3.6,1.2,3.1,0.9,0.1],["Michael Cage",1.3,3.9,0.4,0.6,0.6],["Mookie Blaylock",12.96,3.39,5.87,2.16,0.52],["P.J. Brown",8.39,6.4,1.64,0.93,1.37],["Pete Myers",7.1,2.4,3.6,0.7,0.3],["Purvis Short",13.1,3,1.8,0.8,0.2],["Rafael Addison",6.04,2.06,0.85,0.35,0.31],["Reggie Theus",18.6,2.8,4.7,1,0.4],["Rex Walters",5.15,1.01,1.46,0.42,0.15],["Rick Mahorn",3.16,2.89,0.35,0.25,0.29],["Robert Pack",15.9,2.5,9.6,1.7,0.1],["Roy Hinson",12.25,5.63,0.77,0.44,0.89],["Rumeal Robinson",7.96,1.89,3.75,1.15,0.2],["Sam Bowie",12.8,8.19,1.96,0.57,1.65],["Sam Cassell",19.47,3.08,7.54,1.57,0.29],["Scott Burrell",6.6,3.7,1.4,1.3,0.3],["Sean Higgins",4.7,1.4,0.5,0.2,0.2],["Shawn Bradley",12.31,7.97,0.69,0.6,3.81],["Sherman Douglas",8,1.7,4,0.7,0.1],["Sleepy Floyd",4.1,1.1,2.6,0.3,0.1],["Stephon Marbury",23.4,2.6,8.7,1,0.1],["Tate George",4.2,1.03,1.87,0.43,0.06],["Terry Mills",7.7,4.93,0.81,0.57,0.5],["Tim Perry",2.4,1.6,0.3,0.1,0.5],["Tony Massenburg",7.2,6.5,0.3,0.5,0.6],["Vern Fleming",7.7,2.2,3.3,0.5,0.1],["Xavier McDaniel",4.55,4.25,0.88,0.5,0.25],["Yinka Dare",2.11,2.54,0.05,0.09,0.65]]],
    ["BKN","2000s",[["Aaron Williams",7.2,4.72,1.01,0.46,0.88],["Alonzo Mourning",9.44,5.18,0.76,0.26,1.58],["Anthony Johnson",3.66,1.1,1.33,0.7,0.07],["Antoine Wright",4.57,2.31,0.94,0.42,0.23],["Billy Thomas",3.26,1.21,0.6,0.52,0],["Bobby Simmons",7.8,3.9,1.3,0.7,0.1],["Boštjan Nachbar",9.04,3.24,0.96,0.49,0.28],["Brandon Armstrong",2.2,0.61,0.24,0.2,0.02],["Brian Scalabrine",3.92,2.89,1.04,0.38,0.24],["Brook Lopez",13,8.1,1,0.5,1.8],["Chris Douglas-Roberts",4.9,1.1,1.2,0.3,0.2],["Clifford Robinson",5.86,3.02,1.05,0.47,0.5],["Darrell Armstrong",2.5,1.3,1.5,0.6,0],["DeSagana Diop",2.5,4.5,0.5,0.2,0.9],["Derrick Dial",2.9,1.8,1.2,0.3,0.2],["Devin Harris",19.73,3.3,6.79,1.62,0.23],["Dikembe Mutombo",5.8,6.4,0.8,0.2,1.5],["Donny Marshall",1.3,1.09,0.26,0.17,0],["Eddie Gill",3.66,1.47,2.13,0.5,0.16],["Eddie House",8.4,1.6,1.2,0.5,0.1],["Eduardo Nájera",2.9,2.5,0.7,0.4,0.1],["Elliot Perry",5.3,1,2.3,0.7,0],["Eric Williams",12.6,4.5,2,0.8,0.1],["Evan Eschmeyer",3.25,4.49,0.56,0.51,0.77],["Gheorghe Mureșan",3.5,2.3,0.3,0,0.4],["Hassan Adams",2.9,1.3,0.2,0.3,0.1],["Jabari Smith",3.7,2.5,0.8,0.6,0.3],["Jacque Vaughn",4.29,1.29,1.69,0.55,0],["Jamaal Magloire",1.8,3.4,0.3,0,0.4],["Jamie Feick",5.56,9.3,0.8,0.56,0.5],["Jarvis Hayes",8.7,3.6,0.7,0.7,0.1],["Jason Collins",4.44,4.51,1.12,0.62,0.6],["Jason Kidd",14.57,7.26,9.14,1.88,0.26],["Jeff McInnis",5.3,1.8,1.9,0.4,0.1],["Jim McIlvaine",2.23,3.16,0.44,0.4,1.59],["Johnny Newman",10.45,2,1.1,0.7,0.1],["Josh Boone",5.65,4.91,0.51,0.37,0.68],["Keith Van Horn",16.99,7.79,1.93,0.8,0.59],["Kendall Gill",11.94,3.84,2.8,1.71,0.41],["Kenyon Martin",15.11,7.59,2.35,1.27,1.39],["Kerry Kittles",13.14,3.72,2.51,1.51,0.43],["Keyon Dooling",9.7,2,3.5,0.9,0.1],["Lamond Murray",3.4,2.3,0.2,0.3,0.1],["Lucious Harris",8.5,2.83,1.73,0.76,0.1],["Malik Allen",5.4,2.7,0.6,0.3,0.4],["Marc Jackson",4.6,2.4,0.6,0.1,0.2],["Marcus Williams",6.44,2.02,3.02,0.44,0.04],["Maurice Ager",2.07,0.54,0.24,0.06,0.06],["Michael Cage",1.4,4.1,0.5,0.4,0.4],["Mikki Moore",9.35,4.88,0.86,0.57,0.76],["Nenad Krstić",11.3,5.68,1.05,0.36,0.73],["Richard Jefferson",17.39,5.38,3.04,0.89,0.37],["Robert Pack",1.9,0.7,1,0.5,0],["Rodney Buford",7,3,1,0.6,0.1],["Rodney Rogers",7.4,4.15,1.8,0.8,0.45],["Ryan Anderson",7.4,4.7,0.8,0.7,0.3],["Scott Burrell",6.1,3.5,1,0.9,0.6],["Scott Padgett",3.4,2.7,0.7,0.5,0.2],["Sean Williams",4.6,3.78,0.4,0.34,1.31],["Sherman Douglas",5.78,1.35,2.22,0.68,0.07],["Soumaila Samake",1.4,1.6,0,0.1,0.4],["Stephen Jackson",8.2,2.7,1.8,1.1,0.2],["Stephon Marbury",23.01,3.15,8.02,1.36,0.15],["Stromile Swift",4.73,3.06,0.2,0.16,0.77],["Tamar Slay",2.52,0.98,0.48,0.36,0.06],["Todd MacCulloch",9.7,6.1,1.3,0.4,1.4],["Travis Best",6.8,1.4,1.9,0.9,0.1],["Trenton Hassell",3.07,2.37,0.87,0.33,0.23],["Vince Carter",23.61,5.75,4.72,1.16,0.52],["Vladimir Stepania",2.8,3.8,0.6,0.3,0.4],["Yi Jianlian",8.6,5.3,1,0.5,0.6],["Zoran Planinić",3.77,1.32,1.09,0.43,0.07]]],
    ["BKN","2010s",[["Alan Anderson",7.3,2.49,1.05,0.7,0.1],["Allen Crabbe",11.89,3.97,1.42,0.56,0.43],["Andray Blatche",10.72,5.19,1.24,1,0.61],["Andrea Bargnani",6.6,2.1,0.4,0.1,0.2],["Andrei Kirilenko",4.38,2.92,1.4,0.79,0.35],["Anthony Bennett",5,3.4,0.5,0.2,0.1],["Anthony Morrow",12.58,2.48,1.1,0.51,0.1],["Ben Uzoh",3.8,1.5,1.6,0.3,0.2],["Bobby Simmons",5.3,2.7,0.7,0.7,0.1],["Bojan Bogdanović",11.17,3.12,1.23,0.4,0.1],["Brook Lopez",19.54,6.95,1.62,0.59,1.74],["C.J. Watson",6.8,1.8,2,0.8,0.2],["Caris LeVert",11.16,3.59,3.35,1.07,0.26],["Chris Douglas-Roberts",9.8,3,1.4,0.8,0.3],["Chris McCullough",3.89,2.21,0.29,0.79,0.35],["Chris Quinn",2.2,0.6,1.2,0.4,0],["Cory Jefferson",3.7,2.9,0.3,0.2,0.4],["Courtney Lee",12.5,3.5,1.7,1.3,0.3],["D'Angelo Russell",19.02,3.9,6.33,1.05,0.27],["Damion James",4.24,3.5,0.67,0.65,0.57],["Dante Cunningham",7.5,4.8,1,0.5,0.6],["Darius Morris",2.2,0.7,1.3,0.2,0],["DeMarre Carroll",12.35,5.93,1.67,0.66,0.26],["DeShawn Stevenson",2.9,2,0.8,0.4,0.1],["Deron Williams",16.64,3.16,7.48,1.14,0.32],["Derrick Favors",6.3,5.3,0.4,0.3,0.7],["Devin Harris",16.03,2.83,7.06,1.15,0.21],["Donald Sloan",7,2.8,4.4,0.5,0.1],["Ed Davis",5.8,8.6,0.8,0.4,0.4],["Gerald Green",12.9,3.5,1.1,0.9,0.5],["Gerald Wallace",9.11,5.01,2.69,1.4,0.7],["Isaiah Whitehead",7.2,2.34,2.37,0.58,0.43],["Jahlil Okafor",6.4,2.9,0.4,0.1,0.6],["Jared Dudley",4.9,2.6,1.4,0.6,0.3],["Jarrett Allen",9.62,6.98,1.07,0.45,1.36],["Jarrett Jack",12.23,3.44,5.47,0.96,0.2],["Jarvis Hayes",7.8,2.4,0.9,0.6,0.2],["Jason Collins",1.1,0.9,0.2,0.4,0],["Jason Terry",4.5,1.1,1.6,0.4,0],["Jeremy Lin",14.59,3.7,5.07,1.17,0.39],["Jerome Jordan",3.1,2.4,0.3,0.2,0.3],["Jerry Stackhouse",4.9,0.9,0.9,0.2,0.1],["Joe Harris",11.21,3.36,1.74,0.49,0.24],["Joe Johnson",14.74,3.79,3.45,0.67,0.13],["Johan Petro",3.8,3.23,0.69,0.4,0.4],["Jordan Farmar",9.88,2.12,4.41,0.73,0.1],["Jordan Williams",4.6,3.6,0.3,0.5,0.3],["Jorge Gutiérrez",3.1,1.18,1.48,0.46,0.06],["Josh Boone",4,5,0.5,0.5,0.8],["Justin Hamilton",6.9,4.1,0.9,0.5,0.7],["K.J. McDaniels",6.3,2.6,0.5,0.6,0.5],["Keith Bogans",4.2,1.64,0.97,0.4,0.09],["Kevin Garnett",6.63,6.69,1.54,0.89,0.52],["Keyon Dooling",6.9,1,2.5,0.6,0],["Kris Humphries",9.51,8.56,0.95,0.5,0.91],["Luis Scola",5.1,3.9,1,0.4,0.1],["MarShon Brooks",8.53,2.36,1.56,0.67,0.24],["Marcus Thornton",12.3,2.8,1.2,1,0.1],["Markel Brown",5.34,2.13,1.2,0.64,0.24],["Marquis Teague",3,1,1.4,0.4,0],["Mason Plumlee",8.1,5.37,0.9,0.75,0.8],["Mirza Teletović",6.94,3.38,0.77,0.34,0.29],["Nik Stauskas",5.1,1.8,1.1,0.1,0.1],["Paul Pierce",13.5,4.6,2.4,1.1,0.4],["Quincy Acy",6.09,3.57,0.74,0.47,0.43],["Quinton Ross",1.6,0.8,0.3,0.1,0.2],["Rafer Alston",9.7,2.8,3.9,1,0.2],["Randy Foye",5.2,2.2,2,0.5,0.1],["Reggie Evans",4.01,9.44,0.42,0.76,0.17],["Rodions Kurucs",8.5,3.9,0.8,0.7,0.4],["Rondae Hollis-Jefferson",9.9,5.9,1.98,0.99,0.6],["Sasha Vujačić",11.4,3.3,2.3,0.9,0.1],["Sean Kilpatrick",12.04,3.36,1.78,0.48,0.1],["Sean Williams",2.6,2.3,0.1,0.4,1],["Sergey Karasev",3.39,1.73,1.13,0.43,0.05],["Shabazz Napier",9.4,1.8,2.6,0.7,0.3],["Shane Larkin",7.3,2.3,4.4,1.2,0.2],["Shaun Livingston",8.3,3.2,3.2,1.2,0.4],["Shawne Williams",4.5,2.7,0.6,0.4,0.4],["Shelden Williams",4.6,6,0.6,0.8,0.7],["Spencer Dinwiddie",12.47,2.82,4.95,0.74,0.33],["Stephen Graham",3.4,2.1,0.7,0.2,0],["Sundiata Gaines",5.16,1.97,2.24,0.99,0],["Terrence Williams",8.21,4.4,2.92,0.59,0.09],["Thaddeus Young",14.74,8.14,1.76,1.47,0.44],["Thomas Robinson",4.3,5.1,0.6,0.5,0.5],["Timofey Mozgov",4.2,3.2,0.4,0.2,0.4],["Tornike Shengelia",1.55,1.01,0.44,0.15,0.1],["Travis Outlaw",9.2,4,1,0.4,0.4],["Trenton Hassell",4.5,2.9,1,0.3,0.2],["Treveon Graham",5.3,3.1,1,0.4,0.2],["Trevor Booker",10.02,7.72,1.94,0.96,0.38],["Tyler Zeller",7.1,4.6,0.7,0.2,0.5],["Tyshawn Taylor",2.84,0.58,0.98,0.38,0],["Wayne Ellington",7.7,2.3,1.1,0.6,0.1],["Willie Reed",4.7,3.1,0.3,0.2,0.8],["Yi Jianlian",12,7.2,0.9,0.7,1]]],
    ["BKN","2020s",[["LaMarcus Aldridge",13.2,5,1.4,0.3,1.1],["Kevin Durant",28.4,7.2,6,0.8,1.1],["Jeff Green",11,3.9,1.6,0.5,0.4],["DeAndre Jordan",7.5,7.5,1.6,0.3,1.1],["Goran Dragic",7.5,3.1,4.1,0.9,0.2],["Blake Griffin",8.7,4.5,2.5,0.6,0.3],["James Harden",24.6,7.9,10.8,1.2,0.8],["James Johnson",5.5,3.5,2.1,0.5,0.5],["Patty Mills",8.8,1.5,1.8,0.5,0.2],["Kyrie Irving",27.1,4.6,5.9,1.4,0.6],["Iman Shumpert",1,0.5,0,0.5,0],["Andre Drummond",7.9,9.3,1.8,1.1,0.9],["Nerlens Noel",2.1,2.7,0.6,0.9,0.6],["Andre Roberson",1.2,3,0.8,0.6,0.2],["Dennis Schröder",14,3,6.1,0.8,0.2],["Seth Curry",12.1,2.4,2.6,0.7,0.2],["Spencer Dinwiddie",12,3.8,4.8,0.8,0.3],["Joe Harris",11,3.3,1.4,0.6,0.2],["Noah Vonleh",0,0.3,0.3,0,0],["Tyler Johnson",5.4,2,1.2,0.4,0],["D'Angelo Russell",12.6,2.8,5.1,1,0.4],["Royce O'Neale",8.8,5.1,3.7,0.9,0.6],["Ben Simmons",6.5,7.1,5.9,1.1,0.6],["Timothe Luwawu-Cabarrot",6.4,2.2,1.2,0.6,0.1],["Dorian Finney-Smith",8.4,4.8,1.6,0.8,0.6],["Shaquille Harrison",2,2,1.5,0.5,0.5],["Dennis Smith Jr.",6.6,2.9,3.6,1.2,0.2],["Edmond Sumner",7.1,1.5,1.3,0.6,0.2],["Mike James",7.7,2.5,4.2,0.5,0.1],["Keita Bates-Diop",3.7,2.1,0.7,0.5,0.4],["Mikal Bridges",19.9,4.5,3.5,1.1,0.6],["Bruce Brown",8.9,5.1,1.9,1,0.6],["Alize Johnson",5.2,5,0.8,0.3,0.3],["De'Anthony Melton",10.3,3.3,2.8,1.2,0.3],["Michael Porter Jr.",24.2,7.1,3,1.1,0.3],["Landry Shamet",9.3,1.8,1.6,0.5,0.2],["Lonnie Walker IV",9.7,2.2,1.3,0.6,0.3],["Yuta Watanabe",5.6,2.4,0.8,0.4,0.3],["Chris Chiozza",4,1.1,3,0.3,0.3],["Terance Mann",7.2,3.2,3,0.7,0.2],["Reggie Perry",3,2.8,0.5,0.2,0.2],["Nic Claxton",10.3,7.4,1.9,0.7,1.6],["Cameron Johnson",15.9,4.3,2.6,1,0.3],["Armoni Brooks",4.2,1.8,0.5,0.1,0.1],["Killian Hayes",9,3,5.2,0.7,0.7],["Trevon Scott",8,5.2,1.7,1.3,0.8],["Ziaire Williams",10.1,3.5,1.2,1.2,0.4],["Ochai Agbaji",5.1,2.3,0.8,0.4,0.3],["Day'Ron Sharpe",6.9,5.8,1.4,0.6,0.6],["Keon Johnson",8.4,2.6,1.4,0.8,0.3],["Kessler Edwards",5.9,3.6,0.6,0.6,0.5],["Cam Thomas",16.4,2.6,2.3,0.6,0.1],["David Duke Jr.",4.2,2.1,0.9,0.5,0.1],["RaiQuan Gray",16,9,7,0,1],["Trendon Watford",8.6,3.4,2,0.5,0.3],["Jalen Wilson",7,2.8,1.2,0.4,0.1],["E.J. Liddell",5.7,2.7,0.9,0.2,0.4],["Tyson Etienne",7.9,1.2,1.7,0.5,0.1],["Dru Smith",2.9,1.6,1.5,0.7,0.3],["Drew Timme",12.1,7.2,2.2,0.4,0.1],["Josh Minott",7.4,3.2,0.9,0.9,0.5],["Tyrese Martin",8.7,3.7,2,0.6,0.2],["Alondes Williams",0,1,0,0,0],["Jacob Gilyard",4.2,1.1,3.3,0.8,0.1],["Maxwell Lewis",4.1,2,0.7,0.3,0.3],["Dariq Whitehead",3.6,1.8,1.1,0.1,0.3],["Noah Clowney",9.1,3.8,1.1,0.5,0.6],["Reece Beekman",2.6,1.1,1.8,0.9,0.1],["Grant Nelson",4.3,1.5,1.3,0.3,1.3],["Tosan Evbuomwan",9.5,4.3,2,0.9,0.4],["Malachi Smith",8.3,3.4,3.3,0.8,0.3],["Cui Cui",0.6,0.4,0,0,0],["Nolan Traore",8.9,1.8,3.8,0.8,0.4],["Egor Dëmin",10.3,3.2,3.3,0.8,0.3],["Danny Wolf",8.9,4.9,2.2,0.5,0.6],["Ben Saraf",7.5,2.1,3.3,0.9,0.2],["Drake Powell",6.5,1.8,1.4,0.6,0.2],["Chaney Johnson",8.2,4.6,2.1,0.9,0.5]]],
    ["BOS","1960s",[["Bailey Howell",19.83,9.01,1.56,null,null],["Bill Russell",14.82,22.55,4.63,null,null],["Bill Sharman",17.78,3.7,2.18,null,null],["Bob Cousy",16.59,3.77,7.95,null,null],["Carl Braun",3.7,1,1.5,null,null],["Clyde Lovellette",6.58,2.86,0.44,null,null],["Dan Swartz",4.5,2.3,0.5,null,null],["Don Chaney",4,2.3,1,null,null],["Don Nelson",9.84,5,1.08,null,null],["Em Bryant",5.7,2.4,2.2,null,null],["Frank Ramsey",13.06,4.79,1.48,null,null],["Gary Phillips",4,1.6,1,null,null],["Gene Conley",6.49,7.79,0.5,null,null],["Gene Guarilia",3.2,2.3,0.27,null,null],["Jim Barnes",5.1,4,0.6,null,null],["Jim Barnett",4.1,1.1,0.9,null,null],["Jim Loscutoff",4.17,3.41,0.45,null,null],["John Havlicek",19.32,6.21,3.51,null,null],["John Richter",4.3,4.7,0.4,null,null],["John Thompson",3.55,3.52,0.3,null,null],["Johnny Jones",4.2,2.2,0.5,null,null],["Johnny McCarthy",1.3,1.3,0.9,null,null],["K.C. Jones",7.72,3.63,4.53,null,null],["Larry Siegfried",11.43,2.87,3.19,null,null],["Mal Graham",4.65,1.72,1.08,null,null],["Mel Counts",6.79,5.73,0.57,null,null],["Rich Johnson",2.2,1.7,0.2,null,null],["Ron Bonham",6.27,1.48,0.4,null,null],["Sam Jones",19.34,5,2.8,null,null],["Toby Kimball",2.6,3.8,0.3,null,null],["Tom Heinsohn",19.13,8.31,2.05,null,null],["Tom Sanders",10.59,7.17,1.14,null,null],["Tom Thacker",4.2,2.5,1.1,null,null],["Wayne Embry",5.77,4.1,0.65,null,null],["Willie Naulls",10.32,4.6,0.93,null,null],["Woody Sauldsberry",4.4,3.6,0.4,null,null]]],
    ["BOS","1970s",[["Art Williams",3.99,2.5,3.13,0.7,0],["Bailey Howell",12.6,6.7,1.5,null,null],["Bill Dinwiddie",4.9,3.4,0.6,null,null],["Billy Knight",13.9,4.3,1.7,0.8,0.1],["Bob McAdoo",20.6,7.1,2,0.6,1],["Bobby Wilson",2,0.4,0.6,0.1,0],["Cedric Maxwell",13.46,7.72,1.95,0.96,0.81],["Charlie Scott",17.51,4.18,4.39,1.39,0.28],["Chris Ford",15.6,3.3,4.7,1.5,0.3],["Curtis Rowe",8,5.51,1.23,0.3,0.37],["Dave Bing",13.6,2.7,3.8,1,0.2],["Dave Cowens",18.56,14.59,3.99,1.18,1],["Dennis Awtrey",2.2,2,0.9,0.1,0.3],["Don Chaney",9.51,4.29,2.13,1.16,0.56],["Don Nelson",12.35,5.28,1.83,0.27,0.17],["Earl Williams",6.1,5.3,0.6,0.6,0.5],["Em Bryant",7.8,3.8,3.3,null,null],["Ernie DiGregorio",3.9,1,2.4,0.4,0],["Frankie Sanders",5.5,2.1,0.7,0.3,0.1],["Fred Saunders",5.04,2.77,1.05,0.37,0.13],["Garfield Smith",2.69,2.1,0.24,null,null],["Glenn McDonald",4.29,1.48,0.67,0.32,0.21],["Hank Finkel",4.59,3.7,0.76,0.1,0.05],["Jeff Judkins",8.8,2.4,1.8,1,0.1],["Jerome Anderson",2.8,0.6,0.3,0.1,0.1],["Jim Ard",3.67,3.88,0.69,0.19,0.43],["Jim Barnes",5.9,4.5,0.7,null,null],["Jo Jo White",18.38,4.27,5.15,1.33,0.23],["John Havlicek",21.92,6.38,5.84,1.22,0.3],["Kermit Washington",11.8,10.5,1.3,0.9,1.3],["Kevin Stacom",5.29,1.49,1.5,0.31,0.04],["Larry Siegfried",12.6,2.7,3.8,null,null],["Marvin Barnes",8.1,4.7,1.4,1,1],["Paul Silas",11.52,12.34,2.65,0.73,0.3],["Paul Westphal",7.32,1.65,2.15,0.75,0.4],["Phil Hankinson",3.91,1.85,0.16,0.12,0],["Rex Morgan",2.77,1.48,0.6,null,null],["Rich Johnson",5.83,3.23,0.49,null,null],["Rick Robey",12.4,7.2,2.2,0.6,0.1],["Sidney Wicks",14.26,9.16,2.1,0.8,0.65],["Steve Kuberski",5.87,4,0.6,0.13,0.13],["Tiny Archibald",11,1.5,4.7,0.8,0.1],["Tom Boswell",5.91,3.91,1.02,0.34,0.12],["Tom Sanders",6.3,3.59,1.07,null,null]]],
    ["BOS","1980s",[["Artis Gilmore",3.5,3.1,0.3,0.2,0.4],["Bill Walton",7.07,6.39,1.97,0.46,1.27],["Brad Lohaus",4.77,2.41,0.82,0.34,0.56],["Brian Shaw",8.6,4.6,5.8,1,0.3],["Carlos Clark",2.37,0.9,0.7,0.5,0],["Cedric Maxwell",13.76,6.27,2.41,0.88,0.56],["Charles Bradley",3.3,1.1,0.45,0.45,0.3],["Chris Ford",8.57,1.96,2.82,1.1,0.27],["Conner Henry",2.85,0.84,0.89,0.18,0.02],["Danny Ainge",11.25,2.76,4.35,1.21,0.12],["Darren Daye",4.81,1.83,1.33,0.49,0.1],["Dave Cowens",14.2,8.1,3.1,1,0.9],["David Thirdkill",2.84,1.32,0.25,0.17,0.07],["Dennis Johnson",13.47,3.33,6.44,1.23,0.47],["Dirk Minniefield",3.2,1.2,3.1,0.7,0],["Don Chaney",2.8,1.2,0.6,0.5,0.2],["Ed Pinckney",10.1,5.1,1.5,1,0.8],["Eric Fernsten",2.25,1.4,0.32,0.18,0.2],["Fred Roberts",5.8,2.4,0.95,0.25,0.25],["Gerald Henderson",8.81,1.6,2.76,1.06,0.12],["Greg Kite",1.59,1.96,0.31,0.1,0.38],["Jeff Judkins",5.4,1,0.7,0.4,0.1],["Jerry Sichting",5.85,1.21,2.37,0.56,0],["Jim Paxson",8.63,1.2,1.87,0.73,0.1],["Joe Kleine",6.1,4.9,1.1,0.5,0.2],["Kelvin Upshaw",7,1.6,4.2,0.8,0.1],["Kevin Gamble",4.3,1,0.8,0.3,0.1],["Kevin McHale",18.48,7.6,1.77,0.38,1.81],["Larry Bird",24.97,10.21,6.12,1.81,0.84],["M.L. Carr",6.27,2.26,1.33,0.83,0.25],["Mark Acres",2.98,2.96,0.41,0.36,0.21],["Pete Maravich",11.5,1.5,1.1,0.3,0.1],["Quinn Buckner",4.75,1.82,2.82,1.13,0.03],["Ray Williams",6.4,2.5,3.9,1.3,0.2],["Reggie Lewis",13.22,3.42,1.87,1.05,0.67],["Rick Carlisle",2.22,0.82,1.07,0.18,0.05],["Rick Robey",7.87,4.76,1.16,0.42,0.18],["Robert Parish",17.94,10.38,1.84,0.85,1.73],["Ron Grandison",2.5,1.3,0.6,0.3,0],["Sam Vincent",3.42,0.71,1.24,0.3,0.06],["Scott Wedman",6.22,2.09,1.06,0.41,0.18],["Terry Duerod",2.86,0.4,0.36,0.16,0],["Tiny Archibald",12.86,1.99,7.62,0.92,0.1]]],
    ["BOS","1990s",[["Acie Earl",4.55,2.78,0.17,0.27,0.58],["Alaa Abdelnaby",7.64,4.58,0.28,0.28,0.28],["Alton Lister",1.96,3.82,0.25,0.15,0.51],["Andrew DeClercq",5.4,4.76,0.7,0.99,0.6],["Antoine Walker",19.7,9.38,3.22,1.5,0.66],["Blue Edwards",7.1,2.1,1.5,0.6,0.3],["Brett Szabo",2.2,2.4,0.2,0.2,0.5],["Brian Shaw",13.18,4.59,7.18,1.19,0.44],["Bruce Bowen",4.51,2.5,1.17,1.17,0.43],["Charles Smith",2.82,1.14,1.66,0.57,0.09],["Chauncey Billups",11.1,2.2,4.3,1.5,0],["Chris Corchiani",2.3,0.9,1.7,0.4,0],["Dana Barros",11.06,2.12,3.78,0.91,0.09],["David Wesley",12.7,3.12,5.79,1.66,0.16],["Dee Brown",11.57,2.74,3.96,1.41,0.36],["Dennis Johnson",7.1,2.7,6.5,1.1,0.2],["Derek Strong",6.3,5.4,0.6,0.3,0.2],["Dino Radja",16.68,8.39,1.59,0.9,1.24],["Dominique Wilkins",17.8,5.2,2.2,0.8,0.2],["Ed Pinckney",5.69,5.32,0.76,0.75,0.61],["Eric Montross",8.77,6.64,0.59,0.36,0.67],["Eric Riley",2.2,2.8,0.4,0.3,0.7],["Eric Williams",12.98,4.04,1.47,0.95,0.2],["Greg Minor",6.89,2.7,1.39,0.59,0.17],["Jim Paxson",6.4,1.1,1.9,0.5,0.1],["Jimmy Oliver",4.9,1,0.8,0.4,0],["Joe Kleine",4.26,4.11,0.48,0.22,0.23],["John Bagley",5.7,1.85,5.83,0.72,0.09],["John Thomas",3.3,2.1,0.4,0.6,0.3],["Junior Burrough",3.1,1.8,0.2,0.2,0.2],["Kenny Anderson",11.81,2.81,5.89,1.19,0.07],["Kevin Gamble",11.99,2.74,2.49,0.87,0.37],["Kevin McHale",16.26,6.67,1.65,0.31,1.51],["Larry Bird",21.64,9.19,7.22,1.41,0.84],["Lorenzo Williams",1.5,2,0.2,0.2,0.6],["Marty Conlon",7.8,4.4,1.4,0.6,0.2],["Michael Hawkins",2.8,1.1,2.2,0.6,0],["Michael Smith",4.83,1.37,1.07,0.1,0],["Paul Pierce",16.5,6.4,2.4,1.7,1],["Pervis Ellison",5.24,5.47,0.79,0.54,1.17],["Reggie Lewis",19.34,4.68,2.82,1.33,1.05],["Rick Fox",10.72,3.9,2.83,1.26,0.46],["Rickey Green",4.1,0.9,2.6,0.7,0],["Robert Parish",13.83,9.29,0.98,0.7,1.22],["Ron Mercer",15.88,3.6,2.3,1.6,0.23],["Sherman Douglas",11.07,2.26,6.81,0.88,0.09],["Steve Hamer",2.2,1.7,0.2,0.1,0.1],["Stojko Vranković",1.9,1.56,0.18,0,0.9],["Todd Day",13.33,3.49,1.4,1.21,0.65],["Tony Battie",6.7,6,1.1,0.6,1.4],["Travis Knight",6.5,4.9,1.4,0.7,1.1],["Tyus Edney",5.3,1.1,2.7,1,0],["Vitaly Potapenko",10.8,7.2,1.8,0.7,0.6],["Walter McCarty",8.51,4.18,1.95,1.16,0.47],["Xavier McDaniel",11.29,5.14,1.71,0.65,0.48]]],
    ["BOS","2000s",[["Adrian Griffin",4.96,3.99,1.78,1.14,0.16],["Al Jefferson",10.28,6.9,0.71,0.5,1.04],["Allan Ray",6.2,1.5,0.9,0.4,0.1],["Antoine Walker",21.17,8.24,4.63,1.49,0.52],["Brandon Hunter",3.5,3.3,0.5,0.4,0],["Brian Scalabrine",3.04,1.62,0.79,0.28,0.28],["Bruno Šundov",1.2,1.1,0.3,0.2,0.1],["Bryant Stith",9.7,3.6,2.2,1.2,0.2],["Calbert Cheaney",4,2.1,1.2,0.7,0.2],["Chris Carr",4.8,1.3,0.3,0.1,0.1],["Chris Herren",3.3,0.8,2.2,0.6,0],["Chris Mihm",6.1,5.1,0.2,0.5,0.8],["Chucky Atkins",12,1.9,5.3,1.1,0],["Dana Barros",7.18,1.38,1.78,0.39,0.1],["Danny Fortson",7.6,6.7,0.5,0.4,0.1],["Delonte West",10.36,3.15,3.83,1.01,0.47],["Doug Overton",3.48,0.88,1.3,0.25,0],["Eddie House",8.01,2,1.49,0.8,0.1],["Eric Williams",7.63,3.28,1.49,0.87,0.16],["Erick Strickland",7.7,2.7,2.3,0.7,0],["Gabe Pruitt",2.02,0.8,0.82,0.3,0.08],["Gary Payton",11.3,3.1,6.1,1.1,0.2],["Gerald Green",8.93,2.23,0.89,0.47,0.24],["Glen Davis",5.81,3.52,0.66,0.56,0.3],["Grant Long",1.8,2,0.6,0.2,0],["Henry Walker",3,1,0.4,0.2,0.1],["J.R. Bremer",8.3,2.3,2.6,0.6,0],["James Posey",7.4,4.4,1.5,1,0.3],["Jiří Welsch",8.51,3.21,1.98,1,0.1],["Joe Johnson",6.3,2.9,1.5,0.7,0.2],["Jumaine Jones",2.2,1.6,0.3,0.3,0.2],["Justin Reed",2.09,0.82,0.28,0.16,0.06],["Jérôme Moïso",1.5,1.8,0.1,0.1,0.2],["Kedrick Brown",3.13,2.52,0.6,0.69,0.23],["Kendrick Perkins",5.59,5.65,1.03,0.3,1.38],["Kenny Anderson",11.13,2.97,5.01,1.71,0.1],["Kevin Garnett",17.46,8.89,3,1.27,1.26],["Leon Powe",6.59,4.16,0.41,0.27,0.37],["Marcus Banks",5.28,1.55,2.02,0.9,0.18],["Mark Blount",7.57,4.69,0.99,0.61,0.94],["Michael Olowokandi",2.14,2.24,0.28,0.26,0.46],["Mike James",10.7,3.2,4.4,1.3,0],["Mikki Moore",4.27,3.94,0.89,0.18,0.26],["Milt Palacio",4.99,1.55,2.06,0.68,0.04],["Orien Greene",3.2,1.8,1.6,1,0.1],["Patrick O'Bryant",1.5,1.3,0.3,0.1,0.3],["Paul Pierce",23.29,6.26,3.99,1.56,0.62],["Pervis Ellison",1.8,2.2,0.4,0.3,0.3],["Raef LaFrentz",9.27,5.81,1.31,0.45,1.02],["Rajon Rondo",9.65,4.37,5.72,1.73,0.13],["Randy Brown",4.03,1.77,2.88,1.08,0.21],["Ray Allen",17.82,3.6,2.94,0.9,0.2],["Ricky Davis",16.26,3.73,3.41,1.15,0.25],["Rodney Rogers",10.7,4,1.5,0.6,0.4],["Ryan Gomes",10.05,5.28,1.33,0.65,0.15],["Scot Pollard",1.8,1.7,0.1,0.1,0.3],["Sebastian Telfair",6.1,1.4,2.8,0.6,0.1],["Shammond Williams",7.3,2.2,2.5,1.2,0.1],["Stephon Marbury",3.8,1.2,3.3,0.4,0.1],["Tom Gugliotta",1.3,2.2,0.6,0.5,0.2],["Tony Allen",7.42,2.59,1.28,1.04,0.36],["Tony Battie",6.77,5.86,0.65,0.62,1.05],["Tony Delk",9.21,3.52,2.22,1.08,0.15],["Vin Baker",7.74,4.59,0.97,0.48,0.6],["Vitaly Potapenko",7.1,5.57,0.73,0.53,0.3],["Wally Szczerbiak",16.25,3.45,2.45,0.6,0.1],["Walter McCarty",4.86,2.44,1.06,0.57,0.24]]],
    ["BOS","2010s",[["Abdel Nader",3,1.5,0.5,0.3,0.2],["Al Horford",13.49,6.98,4.63,0.76,1.23],["Amir Johnson",6.9,5.49,1.75,0.65,0.95],["Aron Baynes",5.85,5.13,1.1,0.26,0.64],["Avery Bradley",12.14,3.06,1.72,1.09,0.23],["Brad Wanamaker",3.9,1.1,1.6,0.3,0.1],["Brandon Bass",10.6,5.45,1.09,0.49,0.74],["Brian Scalabrine",1.5,0.9,0.5,0.2,0.1],["Chris Johnson",5.86,2.3,0.75,0.64,0.16],["Chris Wilcox",4.58,3.44,0.4,0.47,0.44],["Courtney Lee",7.69,2.18,1.61,0.99,0.3],["Daniel Theis",5.5,3.84,0.95,0.4,0.7],["David Lee",7.1,4.3,1.8,0.4,0.4],["Delonte West",5.6,1.5,2.7,0.8,0.4],["E'Twaun Moore",2.9,0.9,0.9,0.3,0.1],["Eddie House",7.2,1.4,1,0.6,0.1],["Evan Turner",10,5,4.95,1,0.25],["Gerald Green",5.6,1.8,0.7,0.2,0.1],["Gerald Wallace",3.68,3.02,1.72,1.02,0.16],["Glen Davis",9.49,4.75,0.95,0.75,0.36],["Gordon Hayward",11.37,4.45,3.35,0.89,0.3],["Greg Monroe",9.69,5.96,2.17,1.02,0.65],["Greg Stiemsma",2.9,3.2,0.5,0.7,1.5],["Guerschon Yabusele",2.34,1.43,0.44,0.16,0.2],["Isaiah Thomas",24.67,2.77,5.98,0.96,0.13],["J.R. Giddens",1.1,1,0.3,0.2,0],["JaJuan Johnson",3.2,1.6,0.2,0.1,0.4],["Jae Crowder",12.77,5.21,1.83,1.25,0.4],["James Young",2.26,1.07,0.27,0.27,0.07],["Jared Sullinger",11.08,7.67,1.84,0.69,0.63],["Jason Collins",1.2,1.6,0.2,0.3,0.2],["Jason Terry",10.1,2,2.5,0.8,0.1],["Jaylen Brown",11.22,3.93,1.25,0.76,0.33],["Jayson Tatum",14.79,5.5,1.85,1.05,0.7],["Jeff Green",14.68,4.15,1.53,0.69,0.64],["Jermaine O'Neal",5.2,4.57,0.45,0.2,1.5],["Jerryd Bayless",10.1,2.1,3.1,1,0.1],["Joel Anthony",1,1.5,0.1,0.1,0.4],["Jonas Jerebko",4.57,3.79,0.87,0.36,0.24],["Jordan Crawford",11.82,2.94,4.39,0.7,0.1],["Jordan Mickey",1.42,1.17,0.22,0.06,0.4],["Kelly Olynyk",9.47,4.7,1.71,0.72,0.47],["Kendrick Perkins",9.73,7.67,0.97,0.29,1.58],["Kevin Garnett",14.92,8.05,2.56,1.08,0.87],["Keyon Dooling",4,0.8,1.1,0.3,0],["Kris Humphries",8.4,5.9,1,0.4,0.9],["Kyrie Irving",24.08,4.43,6.05,1.31,0.41],["Leandro Barbosa",5.2,1.1,1.4,0.4,0.1],["Luke Harangody",2.3,2,0.4,0.1,0.3],["Marcus Morris",13.77,5.81,1.42,0.6,0.26],["Marcus Smart",9.32,3.54,3.91,1.56,0.36],["Marcus Thornton",8.9,1.9,0.9,0.5,0.2],["Marquis Daniels",4.9,1.99,1.27,0.63,0.23],["Michael Finley",5.2,1.6,1.1,0.2,0.1],["Mickaël Piétrus",6.9,3.1,0.6,0.5,0.2],["Nate Robinson",6.91,1.57,1.93,0.6,0.07],["Nenad Krstić",9.1,5.3,0.3,0.3,0.3],["Paul Pierce",18.78,5.35,3.9,1.1,0.46],["Phil Pressey",3.08,1.48,2.84,0.78,0.1],["R.J. Hunter",3.09,1.05,0.47,0.42,0.1],["Rajon Rondo",12.04,4.98,10.72,2,0.14],["Rasheed Wallace",9,4.1,1,1,0.9],["Ray Allen",15.91,3.26,2.59,0.94,0.24],["Robert Williams",2.5,2.5,0.2,0.3,1.3],["Sasha Pavlović",2.45,1.38,0.35,0.37,0.22],["Semi Ojeleye",2.96,1.9,0.34,0.26,0.1],["Semih Erden",4.1,2.9,0.5,0.4,0.6],["Shane Larkin",4.3,1.7,1.8,0.5,0],["Shaquille O'Neal",9.2,4.8,0.7,0.4,1.1],["Shavlik Randolph",3.53,3.92,0.28,0.43,0.35],["Shelden Williams",3.7,2.7,0.4,0.2,0.4],["Terrence Williams",4.6,1.8,1.6,0.5,0.1],["Terry Rozier",7.69,3.59,2.31,0.75,0.17],["Tony Allen",6.1,2.7,1.3,1.1,0.4],["Tyler Zeller",7.15,3.99,0.96,0.17,0.48],["Von Wafer",3.2,0.8,0.6,0.3,0.1],["Vítor Luiz Faverani",4.4,3.5,0.4,0.4,0.7]]],
    ["BOS","2020s",[["Joe Johnson",2,0,0,0,0],["CJ Miles",0,0,0,0,0],["Al Horford",10.4,6.6,2.9,0.7,1],["Blake Griffin",4.1,3.8,1.5,0.3,0.2],["Jrue Holiday",11.8,4.8,4.3,1,0.6],["Enes Freedom",3.7,4.6,0.2,0.1,0.4],["Tristan Thompson",7.6,8.1,1.2,0.4,0.6],["Nikola Vučević",15.1,8.4,3.3,0.6,0.6],["Evan Fournier",17.1,3,3.4,1.1,0.5],["Mike Muscala",6.1,3.2,0.8,0.2,0.4],["Nik Stauskas",2.3,0.4,0.3,0,0],["Marcus Smart",12.2,3.5,6,1.6,0.4],["Noah Vonleh",1.1,2.1,0.3,0.1,0.3],["Jabari Parker",5,2.8,0.7,0.2,0.2],["Kristaps Porziņģis",19.8,7,2,0.7,1.7],["Jaylen Brown",24.8,6.2,3.9,1.1,0.4],["Malcolm Brogdon",14.9,4.2,3.7,0.7,0.3],["Jayson Tatum",26.5,8.5,4.9,1.1,0.5],["Justin Jackson",0.9,0.7,0.4,0.2,0.2],["Semi Ojeleye",4.6,2.6,0.7,0.3,0],["Derrick White",14.7,4,4.8,0.9,1.1],["Luke Kornet",4.1,3.3,1,0.3,0.8],["Chris Boucher",2.3,2,0.3,0.6,0.8],["Daniel Theis",8.2,4.9,0.9,0.4,0.7],["Torrey Craig",4.2,2.8,0.7,0.3,0.5],["Svi Mykhailiuk",4,1.2,0.9,0.3,0],["Carsen Edwards",4,0.8,0.5,0.2,0],["Oshae Brissett",3.7,2.9,0.8,0.3,0.1],["Robert Williams III",8.7,8.3,1.7,0.8,1.8],["Kelan Martin",5.7,1.8,0.7,0.4,0.3],["Wenyen Gabriel",3.4,5,0.6,0.4,0.4],["Tacko Fall",2.5,2.7,0.2,0.1,1.1],["Romeo Langford",3.1,1.9,0.7,0.3,0.3],["Moses Brown",8.6,8.9,0.2,0.7,1.1],["Mfiondu Kabengele",1.5,2.5,0,0.5,0],["Neemias Queta",6.9,5.5,1,0.5,0.9],["Tremont Waters",3.8,0.8,2.4,0.6,0],["Grant Williams",6.9,3.7,1.2,0.5,0.5],["Juwan Morgan",2.5,2,0.5,0,0],["Aaron Nesmith",4.2,2.2,0.5,0.3,0.2],["Payton Pritchard",10.1,2.8,2.9,0.6,0.1],["Xavier Tillman",3.1,2.6,0.8,0.6,0.5],["Malik Fitts",1.4,1.1,0.3,0,0],["Brodric Thomas",1.8,0.8,0.9,0.1,0.1],["Matt Ryan",3,0,0,1,0],["Jaden Springer",3.3,1.6,0.9,0.7,0.3],["Justin Champagnie",2.2,1.6,0.8,0.2,0],["Luka Garza",8.1,4.1,1,0.4,0.4],["Sam Hauser",7.1,2.8,0.9,0.4,0.2],["Dalano Banton",2,0.8,1.8,0.3,0.8],["JD Davison",1.9,1,1,0.2,0.1],["Ron Harper Jr.",4.2,1.7,0.8,0.3,0.3],["Baylor Scheierman",4.5,2.8,1.3,0.5,0.1],["Jordan Walsh",2.9,2.5,0.6,0.5,0.3],["Drew Peterson",3,1,0.4,0.4,0.1],["Miles Norris",2.3,3,0,0.7,0.3],["Hugo González",3.9,3.3,0.5,0.6,0.3],["Amari Williams",1.4,1.8,0.5,0.1,0.5],["John Tonje",2.5,1,0.3,0.3,0],["Max Shulga",0.6,0.5,0.2,0.1,0]]],
    ["CHA","1980s",[["Brian Rowsom",6.6,4,0.7,0.3,0.4],["Dave Hoppen",6.5,5,0.7,0.3,0.3],["Dell Curry",11.9,2.2,1,0.9,0.1],["Earl Cureton",6.5,6,1.6,0.6,0.7],["Kelly Tripucka",22.6,3.8,3.2,1.2,0.2],["Kurt Rambis",11.1,9.4,2.1,1.3,0.8],["Michael Holton",8.3,1.6,6.3,1,0.2],["Muggsy Bogues",5.4,2.1,7.8,1.4,0.1],["Ralph Lewis",3.2,1.5,0.4,0.3,0.1],["Rex Chapman",16.9,2.5,2.3,0.9,0.3],["Rickey Green",3.9,0.7,2.5,0.5,0],["Robert Reid",14.7,3.7,1.9,0.6,0.2],["Tim Kempton",6.1,3.8,1.3,0.5,0.2]]],
    ["CHA","1990s",[["Alonzo Mourning",21.25,10.13,1.25,0.46,3.17],["Anthony Frederick",5.9,2.2,1.1,0.6,0.4],["Anthony Goldwire",5.63,1.09,2.74,0.49,0],["Anthony Mason",14.41,10.77,4.91,0.89,0.34],["Armen Gilliam",19.09,8.98,1.38,1.19,0.8],["B.J. Armstrong",4.15,1.17,2.36,0.39,0],["Bobby Phills",12,3.7,3.2,1.34,0.42],["Brad Miller",6.3,3.1,0.6,0.2,0.5],["Brian Rowsom",5.1,3,0.5,0.4,0.3],["Charles Shackleford",3.3,4,0.4,0.2,0.4],["Chuck Person",6.1,2.6,1.2,0.4,0.2],["Chucky Brown",8.5,3.6,1.2,0.3,0.4],["Corey Beck",2.86,1.47,1.58,0.53,0.09],["Darrin Hancock",3.88,1.43,0.7,0.4,0.1],["Dave Hoppen",2.89,2.29,0.34,0.13,0.1],["David Wesley",13.42,2.83,6.46,1.81,0.32],["David Wingate",4.99,2.13,1.97,0.72,0.1],["Dell Curry",14.2,2.93,2.11,1.09,0.28],["Derrick Coleman",13.1,8.9,2.1,0.6,1.1],["Donald Royal",2.69,1.76,0.51,0.34,0.05],["Eddie Johnson",11.5,3.1,1.7,0.5,0.1],["Eddie Jones",17,3.9,4.2,3,1.1],["Elden Campbell",15.3,9.4,1.9,1.2,1.8],["Eldridge Recasner",5,1.8,2.1,0.4,0],["Elliot Perry",2.8,0.8,1.6,0.6,0.1],["Eric Leckner",4.27,4.16,0.5,0.24,0.3],["Frank Brickowski",10.1,4.5,2,1,0.4],["George Zídek",3.5,2.33,0.23,0.1,0.1],["Glen Rice",23.55,4.37,2.36,1,0.27],["Greg Sutton",4.59,1.02,1.83,0.55,0],["Hersey Hawkins",14.35,4.2,2.9,1.55,0.25],["J.R. Reid",9.64,5.86,1.12,0.9,0.5],["Jerry Sichting",3.5,0.6,2.7,0.5,0.1],["Joe Wolf",1.32,1.92,0.56,0.12,0.09],["Johnny Newman",14.71,2.89,2.2,1.06,0.26],["Kelly Tripucka",11.36,3.21,2.45,0.65,0.2],["Kendall Gill",15.61,4.49,4.25,1.49,0.54],["Kenny Anderson",15.2,2.7,8.6,1.6,0.2],["Kenny Gattison",8.44,4.98,1,0.66,0.71],["Kevin Lynch",3.3,1.25,1.12,0.53,0.2],["Khalid Reeves",8.1,2,3.6,0.8,0.1],["Larry Johnson",19.65,9.22,4.14,0.79,0.41],["LeRon Ellis",4.4,3.8,0.5,0.3,0.5],["Malik Rose",3,3,0.6,0.5,0.3],["Matt Geiger",10.69,7.01,0.88,0.67,0.87],["Michael Adams",6.04,1,3.26,0.88,0.08],["Micheal Williams",6.9,1.4,3.5,1,0],["Mike Gminski",6.7,4.59,0.78,0.34,0.43],["Muggsy Bogues",9.23,3.06,8.94,1.73,0.03],["Pete Myers",2.9,2.1,1.5,0.6,0.2],["Rafael Addison",3.16,1.44,0.69,0.2,0.16],["Randolph Keys",6.27,2.85,0.86,0.67,0.26],["Rex Chapman",15.89,2.91,3.23,0.92,0.19],["Richard Anderson",4.3,2.4,1,0.4,0.2],["Ricky Davis",4.5,1.8,1.3,0.7,0.2],["Ricky Pierce",12,2.5,1.8,0.5,0.1],["Robert Parish",4.37,4.2,0.45,0.3,0.54],["Robert Reid",6.4,2.4,1.4,0.6,0.2],["Scott Burrell",8.58,4.14,1.9,0.95,0.48],["Sidney Green",1.7,2,0.2,0,0.1],["Steve Scheffler",1.5,1.2,0.2,0.2,0.1],["Stuart Gray",2.6,3.4,0.4,0.3,0.6],["Tony Bennett",3.57,0.99,1.98,0.44,0],["Tony Delk",5.27,1.56,1.57,0.57,0.1],["Tony Farmer",2.5,1.2,0.2,0.4,0.1],["Tony Smith",5,1.4,2.2,0.7,0.3],["Travis Williams",3.23,2.4,0.47,0.47,0.1],["Vernon Maxwell",6.8,1.4,1.3,0.5,0.1],["Vlade Divac",11.63,8.6,3.26,1.3,1.89]]],
    ["CHA","2000s",[["Adam Morrison",9.17,2.43,1.67,0.33,0.1],["Alan Anderson",5.8,1.9,1,0.33,0.07],["Alexis Ajinça",2.3,1,0.1,0.2,0.2],["Anthony Mason",11.6,8.5,4.5,0.9,0.4],["Baron Davis",12.6,3.77,6.53,1.8,0.4],["Bernard Robinson",4.79,2.6,1.08,0.88,0.14],["Bobby Phills",13.6,2.5,2.8,1.5,0.3],["Boris Diaw",15.1,5.9,4.9,0.8,0.7],["Brad Miller",7.7,5.3,0.8,0.4,0.6],["Brevin Knight",10.81,2.83,8.32,1.99,0.1],["Bryce Drew",3.4,1.2,1.7,0.5,0],["Cartier Martin",2.6,1,0.4,0.2,0.1],["Chucky Brown",4.4,2.7,0.8,0.4,0.2],["D.J. Augustin",11.8,1.8,3.5,0.6,0],["Dale Ellis",2.3,0.9,0.3,0.3,0],["David Wesley",15.05,2.53,4.56,1.35,0.16],["DeSagana Diop",2.8,3.8,0.5,0.4,0.8],["Derek Anderson",6.92,2.16,2.31,0.78,0.06],["Derrick Coleman",13.99,7.52,1.99,0.44,1.42],["Earl Boykins",5.1,0.9,2.7,0.4,0],["Eddie Jones",20.1,4.8,4.2,2.7,0.7],["Eddie Robinson",7.2,2.85,0.7,0.7,0.45],["Elden Campbell",13.23,7.44,1.43,0.77,1.83],["Eldridge Recasner",2.16,1.09,0.85,0.08,0],["Emeka Okafor",14.01,10.66,0.91,0.77,1.9],["George Lynch",3.8,4.1,1.2,0.9,0.3],["Gerald Wallace",16.05,6.79,2.51,1.97,1.21],["Hersey Hawkins",3.1,1.4,1.2,0.6,0.2],["Jake Voskuhl",4.77,3.54,0.68,0.44,0.38],["Jamaal Magloire",6.65,4.84,0.4,0.25,1.05],["Jamal Mashburn",20.58,7.08,5.02,1.1,0.2],["Jamal Sampson",3.4,5.3,0.3,0.2,0.7],["Jared Dudley",5.71,3.71,1.08,0.82,0.1],["Jason Hart",9.5,2.7,5,1.3,0.2],["Jason Kapono",8.5,2,0.8,0.5,0.1],["Jason Richardson",21.35,5.21,3.03,1.34,0.63],["Jeff McInnis",4.42,1.72,3.77,0.4,0.06],["Jermareo Davidson",3.2,1.6,0.3,0.2,0.4],["Jumaine Jones",10.5,4.9,0.8,0.9,0.3],["Juwan Howard",4.4,1.8,0.6,0.2,0.1],["Kareem Rush",10.69,2.24,1.44,0.67,0.26],["Keith Bogans",9.29,2.96,1.59,0.93,0.1],["Kevin Burleson",1.8,0.7,1.2,0.7,0.1],["Lee Nailon",8.4,3.18,0.99,0.53,0.17],["Malik Allen",5,2.1,0.3,0.2,0.5],["Matt Bullard",3.4,1.5,0.5,0.1,0.1],["Matt Carroll",8.82,2.43,0.82,0.62,0.13],["Melvin Ely",7.53,4.01,1.05,0.39,0.77],["Nazr Mohammed",6.73,4.99,0.75,0.4,0.7],["Othella Harrington",2.37,1.68,0.2,0,0.09],["Otis Thorpe",2.8,3,0.6,0.2,0.1],["P.J. Brown",8.45,9.55,1.45,0.85,1.1],["Primož Brezec",9.8,5.26,0.71,0.28,0.51],["Raja Bell",13,4,2.5,0.8,0.1],["Raymond Felton",13.62,3.38,6.67,1.38,0.2],["Ricky Davis",4.7,1.7,1.3,0.6,0.2],["Robert Traylor",3.7,3.1,0.6,0.4,0.6],["Ryan Hollins",2.66,1.65,0.15,0.17,0.52],["Sean May",8.52,5.03,1.21,0.47,0.5],["Sean Singletary",2.3,0.8,0.7,0.2,0],["Shannon Brown",4.8,0.8,0.9,0.6,0.2],["Stacey Augmon",4.6,2.9,1.3,0.7,0.2],["Steve Smith",7.9,1.3,1.5,0.3,0.2],["Theron Smith",3.2,3.5,0.8,0.2,0.1],["Tim James",1.5,1.2,0.3,0.1,0.2],["Todd Fuller",3.3,2.7,0.1,0.2,0.2],["Vladimir Radmanović",8.3,3.3,1.3,0.6,0.3],["Walter Herrmann",7.84,2.69,0.42,0.35,0.07]]],
    ["CHA","2010s",[["Al Jefferson",21.8,10.8,2.1,0.9,1.1],["Anthony Tolliver",6.1,2.6,0.7,0.3,0.2],["Ben Gordon",9.99,1.64,1.74,0.5,0.18],["Bismack Biyombo",4.25,6,0.3,0.27,1.56],["Boris Diaw",10.58,5.14,4.1,0.74,0.62],["Brendan Haywood",3.5,4.8,0.5,0.3,0.8],["Byron Mullens",9.88,5.63,1.17,0.43,0.71],["Chris Douglas-Roberts",6.9,2.4,1,0.6,0.3],["Cody Zeller",6,4.3,1.1,0.5,0.5],["Corey Maggette",15,3.9,1.2,0.7,0],["Cory Higgins",3.68,0.85,0.89,0.15,0.17],["D.J. Augustin",10.6,2.04,4.76,0.68,0.04],["D.J. White",7.12,3.77,0.72,0.3,0.42],["Dante Cunningham",9,4,0.6,0.7,0.5],["DeSagana Diop",1.07,2.6,0.54,0.22,0.62],["Derrick Brown",5.31,2.43,0.68,0.52,0.2],["Dominic McGuire",3.3,3.8,0.8,0.2,0.6],["Eduardo Nájera",2.37,1.77,0.56,0.61,0.2],["Gary Neal",11.2,1.8,1.7,0.5,0],["Gerald Henderson",11.98,3.36,1.99,0.73,0.42],["Gerald Wallace",17.19,9.3,2.22,1.38,1.06],["Hakim Warrick",7,3.3,0.9,0.4,0.2],["Jannero Pargo",6.12,0.89,1.84,0.61,0.04],["Jeff Adrien",3.45,3.7,0.57,0.3,0.53],["Jeff Taylor",6.58,2,0.8,0.57,0.2],["Josh McRoberts",8.7,5.4,3.9,0.72,0.6],["Kemba Walker",16.03,3.73,5.44,1.41,0.37],["Kwame Brown",7.9,6.8,0.7,0.4,0.6],["Luke Ridnour",4,1.4,2.2,0.4,0.2],["Matt Carroll",3.53,1.19,0.55,0.3,0.1],["Michael Kidd-Gilchrist",8.2,5.53,1.19,0.7,0.77],["Nazr Mohammed",7.62,5.06,0.41,0.3,0.79],["Ramon Sessions",12.55,2.47,3.75,0.71,0.1],["Raymond Felton",12.1,3.6,5.6,1.5,0.3],["Reggie Williams",5.78,1.98,1.36,0.44,0.05],["Ronald Murray",9.9,2.1,1.8,0.6,0.3],["Shaun Livingston",6.6,2,2.2,0.6,0.4],["Stephen Graham",4.2,1.9,0.3,0.3,0.1],["Stephen Jackson",19.85,4.81,3.6,1.41,0.45],["Theo Ratliff",5.1,4.2,0.6,0.3,1.5],["Tyrus Thomas",7.52,4.37,0.7,0.7,1.22],["Tyson Chandler",6.5,6.3,0.3,0.3,1.1]]],
    ["CHA","2020s",[["Taj Gibson",2.9,3.2,0.6,0.2,0.5],["Gordon Hayward",16.7,4.9,3.9,1,0.3],["Ish Smith",3.2,1.8,3.4,0.4,0.1],["Bismack Biyombo",5,5.3,1.2,0.3,1.1],["Davis Bertans",6.7,1.4,0.8,0.6,0.3],["Isaiah Thomas",8.4,1.3,1.5,0.3,0.2],["Brad Wanamaker",5.5,1.7,2.9,0.7,0.2],["Cody Zeller",9.4,6.8,1.8,0.6,0.4],["Mason Plumlee",6.5,7.7,3.1,0.8,0.7],["Seth Curry",5.8,1.6,0.9,0.5,0.1],["Jusuf Nurkić",8.9,7.8,2.3,0.8,0.7],["Vasilije Micic",7,1.5,4.4,0.5,0.1],["Montrezl Harrell",13.1,6.1,2,0.4,0.6],["Kelly Oubre Jr.",17.6,4.6,1.1,1.2,0.4],["Terry Rozier",20.3,4.3,4.6,1.3,0.3],["Pat Connaughton",2.6,1.5,0.4,0.3,0],["Malik Monk",11.7,2.4,2.1,0.5,0.1],["Dennis Smith Jr.",8.8,3.1,4.8,1.4,0.5],["Frank Ntilikina",1,1.2,0.8,0,0],["Kobi Simmons",1,0.8,1,0,0.4],["Miles Bridges",18.3,6.7,3.3,0.8,0.6],["Devonte' Graham",14.8,2.7,5.4,0.9,0.1],["Caleb Martin",5,2.7,1.3,0.7,0.2],["Cody Martin",6,3.6,2.4,0.9,0.3],["Svi Mykhailiuk",6.9,1.7,1.7,0.5,0.1],["Josh Okogie",7.1,2.8,0.8,1.2,0.5],["P.J. Washington",13,5.5,2.4,1,1.1],["Arnoldas Kulboka",0,0,0,0,0],["DaQuan Jeffries",6.7,2.9,1.1,0.6,0.5],["Coby White",17.4,3.4,4,0.5,0.1],["Jalen McDaniels",6.8,3.4,1.1,0.6,0.4],["Grant Williams",9.2,4.4,2.1,0.7,0.6],["Marques Bolden",3.4,3.1,0.4,0.3,0.6],["LaMelo Ball",21.4,5.6,7.4,1.4,0.3],["Vernon Carey Jr.",2.4,1.4,0.1,0.1,0.3],["Theo Maledon",6.7,2.8,3.5,0.8,0.3],["Josh Green",5.8,2.1,1.2,0.9,0.2],["Aleksej Pokusevski",5.2,3.2,1.3,0.5,0.5],["Grant Riller",2.6,0.1,0.4,0.1,0],["Nick Richards",5.4,4.2,0.4,0.2,0.7],["Xavier Tillman",1.5,1.4,0.4,0.3,0.2],["Nate Darling",1.3,0.1,0.1,0,0.1],["Xavier Sneed",4.3,1.3,1.3,0,0.3],["Kai Jones",2.2,1.6,0.2,0.2,0.4],["Tre Mann",9.6,2.7,2.9,0.7,0.2],["James Bouknight",4.6,1.5,0.8,0.2,0.1],["JT Thor",3,1.9,0.5,0.2,0.3],["Scottie Lewis",0.5,0,0.5,0.5,0],["Marcus Garrett",7,1.5,3.3,0.8,0.5],["Mark Williams",12.3,9,1.4,0.7,1.1],["Wendell Moore Jr.",4.2,2.6,1.2,0.6,0.1],["Bryce McGowens",5.2,1.9,1.1,0.3,0.2],["Isaiah Wong",6,1.6,1.4,0.6,0],["Moussa Diabaté",6.8,7.4,1.4,0.7,0.8],["Jaylen Sims",7,1,2,0.5,0.2],["Brandon Miller",19.5,4.7,3.1,1,0.7],["Nick Smith Jr.",7.9,1.8,1.8,0.2,0.1],["Amari Bailey",2.3,0.9,0.7,0.3,0],["Ryan Kalkbrenner",7.6,5.5,0.8,0.5,1.5],["Leaky Black",2.7,1.8,0.9,0.3,0.4],["Tosan Evbuomwan",0,0.4,0,0,0],["PJ Hall",4.5,3.9,0.5,0.2,0.5],["Drew Peterson",0.8,1.5,0.3,0.5,0.2],["Antonio Reeves",2.7,0.8,0.3,0.1,0],["Nathan Mensah",1.3,2.6,0.4,0.2,0.6],["Damion Baugh",7.3,3.3,3.7,1,0.1],["Tidjane Salaün",6,4.3,0.9,0.5,0.2],["KJ Simpson",7.8,3,3.1,0.9,0.2],["Kon Knueppel",18.5,5.3,3.4,0.7,0.2],["Liam McNeeley",4.3,2.4,0.8,0.2,0.1],["Sion James",5.4,3.5,2,0.6,0.2]]],
    ["CHI","1960s",[["Barry Clemens",8.07,4.19,1.27,null,null],["Bob Boozer",20.38,8.69,1.56,null,null],["Bob Love",5.1,2.5,0.4,null,null],["Bob Weiss",6.6,2.2,2.8,null,null],["Clem Haskins",13.13,3.76,3.07,null,null],["Dave Newmark",5.6,4.3,0.7,null,null],["Dave Schellhase",2.83,1.02,0.82,null,null],["Don Kojis",10.2,6.1,0.9,null,null],["Erwin Mueller",8.63,5.13,1.97,null,null],["Flynn Robinson",16.61,3.72,2.96,null,null],["George Wilson",4.6,3.8,0.3,null,null],["Gerry Ward",4.2,2.4,1.7,null,null],["Guy Rodgers",17.64,4.26,11,null,null],["Jerry Sloan",15.86,8.24,2.86,null,null],["Jim Barnes",7.88,4.97,0.65,null,null],["Jim Washington",11.46,8.98,1.14,null,null],["Keith Erickson",9.98,4.96,2.51,null,null],["Loy Petersen",2.8,1.1,0.7,null,null],["McCoy McLemore",10.92,5.19,1.24,null,null],["Tom Boerwinkle",9.8,11.1,2.2,null,null]]],
    ["CHI","1970s",[["Al Tucker",7,3.4,0.9,null,null],["Artis Gilmore",21.73,12.93,2.97,0.53,2.2],["Bob Kauffman",4.3,3.3,1.2,null,null],["Bob Love",22.35,7.03,1.77,0.91,0.2],["Bob Weiss",9.91,2.07,4.51,1.3,0.2],["Bobby Wilson",6.73,1.37,0.85,0.45,0],["Cazzie Russell",8.8,2.3,1.7,0.5,0.1],["Charles Dudley",2.7,2,2.7,0.7,0],["Chet Walker",20.65,6.13,2.32,0.7,0.05],["Clem Haskins",20.3,4.6,7.6,null,null],["Cliff Pondexter",3.96,3.8,1.1,0.4,0.22],["Clifford Ray",8.28,11.24,3.29,0.7,2.2],["Dennis Awtrey",3.77,4.16,2.11,0.3,0.2],["Derrek Dickey",2.7,1.9,0.4,0.2,0.1],["Ed Manning",5.6,5.2,0.9,null,null],["Eric Fernsten",2.8,2.24,0.68,0.2,0.43],["Gar Heard",10.3,5.7,0.7,null,null],["Howard Porter",7.14,3.18,0.4,0.3,0.5],["Jack Marin",9.13,2.53,1.49,0.42,0.1],["Jerry Sloan",14.11,7.48,2.48,2.16,0.16],["Jim Fox",9.3,7.09,2.2,null,null],["Jim King",4.94,1.16,1.33,null,null],["Jimmy Collins",3.82,0.9,0.95,null,null],["John Block",7.87,4.17,0.87,0.79,0.58],["John Brown",5,3.1,1.4,0.2,0.1],["John Laskowski",7.05,2.38,0.84,0.76,0.06],["John Mengelt",9.98,1.66,2.48,0.6,0.06],["Johnny Baum",4.48,1.97,0.48,null,null],["Kenny McIntosh",3.24,2.16,0.39,null,null],["Leon Benbow",5.44,1.86,1.59,0.63,0.13],["Loy Petersen",3,0.8,0.7,null,null],["Mark Landsberger",7.01,7.38,0.81,0.3,0.21],["Matt Guokas",6.66,1.75,3.1,0.46,0.18],["Mickey Johnson",15.23,8.38,2.72,1.06,0.73],["Nate Thurmond",7.31,10.49,3.81,0.56,2.19],["Nick Weatherspoon",5.1,3,0.8,0.5,0.2],["Norm Van Lier",12.16,4.68,6.89,1.87,0.18],["Ollie Johnson",9.2,3.2,2.3,0.8,0.5],["Phil Hicks",2.7,1.9,0.7,0.2,0],["Reggie Theus",16.3,2.8,5.2,1.1,0.2],["Rick Adelman",4.41,1.46,1.34,0.81,0.02],["Rowland Garrett",6.04,2.81,0.43,0.27,0.21],["Scott Lloyd",1.7,1.4,0.5,0.1,0.1],["Scott May",11.81,5.07,1.83,0.92,0.12],["Shaler Halimon",6.04,1.76,1.81,null,null],["Steve Patterson",3.2,3.8,1.4,0.3,0.2],["Steve Sheppard",3.89,1.82,0.7,0.2,0],["Tate Armstrong",3.79,0.94,1.13,0.33,0],["Tom Boerwinkle",6.88,8.74,3.28,0.33,0.46],["Tom Kropp",3.3,0.9,0.7,0.3,0],["Walt Wesley",9.5,6.3,0.9,null,null],["Wilbur Holland",14.7,3.3,3.67,1.86,0.17]]],
    ["CHI","1980s",[["Artis Gilmore",16.69,9.15,1.93,0.56,2.07],["Ben Poquette",2.4,1.1,0.3,0.1,0.6],["Bill Cartwright",12.4,6.7,1.2,0.3,0.5],["Bob Wilkerson",10,3.5,3.4,1.3,0.3],["Brad Sellers",8.31,3.5,1.4,0.47,0.87],["Caldwell Jones",3.4,5,0.8,0.3,0.7],["Charles Davis",3.8,2.3,0.6,0.2,0.1],["Charles Oakley",12.22,11.63,2.79,0.9,0.37],["Coby Dietrick",4.83,3.45,1.77,0.8,0.54],["Craig Hodges",10,1.7,2.8,0.8,0.1],["Dave Corzine",9.81,6.34,2,0.5,1.05],["Dave Greenwood",12.56,9.1,2.23,0.79,1.12],["Del Beshore",3.6,0.9,2,0.9,0.1],["Dennis Awtrey",3.3,4.4,1.5,0.5,0.6],["Dudley Bradley",3.5,1.8,1.8,0.8,0.2],["Dwight Jones",8.24,5.38,1.32,0.51,0.47],["Earl Cureton",6.9,5.3,1.6,0.3,0.6],["Elston Turner",3.01,1.4,1.3,0.42,0.08],["Ennis Whatley",6.81,1.99,6.95,1.22,0.15],["Gene Banks",10.38,4.62,2.93,0.91,0.19],["George Gervin",16.2,2.6,1.8,0.6,0.3],["Granville Waiters",1.53,1.77,0.33,0.17,0.7],["Horace Grant",9.82,7.03,1.59,0.85,0.75],["Jack Haley",2.2,1.4,0.2,0.2,0],["James Wilkes",4.86,2.43,0.87,0.5,0.3],["Jawann Oldham",4.76,4.19,0.54,0.29,1.8],["John Mengelt",6.1,0.6,1.1,0.3,0],["John Paxson",8.02,1.38,4.27,0.7,0.05],["Kyle Macy",8.6,2.2,5.4,1,0.1],["Larry Kenon",10.72,4.12,1.33,0.76,0.15],["Mark Landsberger",8.4,8.3,0.6,0.4,0.3],["Mark Olberding",8.7,4.5,1.6,0.6,0.1],["Michael Holton",7.1,1.3,2,1,0],["Michael Jordan",32.65,6.15,5.93,2.81,1.18],["Mike Brown",4.24,3.5,0.49,0.26,0.1],["Mike Smrek",2.8,2.9,0.5,0.2,0.6],["Mitchell Wiggins",12.4,4,2.3,1.3,0.1],["Ollie Johnson",7.7,2.1,2,0.7,0.3],["Ollie Mack",7.19,1.89,1.27,0.83,0.09],["Orlando Woolridge",17.37,4.72,1.87,0.68,0.61],["Pete Myers",2.3,0.6,0.7,0.5,0.1],["Quintin Dailey",16.45,2.82,2.91,0.98,0.1],["Ray Blume",4.6,0.8,1.4,0.5,0],["Reggie Theus",19.32,3.56,5.7,1.36,0.19],["Ricky Sobers",13.16,2.28,4.35,1.33,0.2],["Rod Higgins",7.18,3.13,1.58,0.59,0.49],["Ronnie Lester",8.69,2.27,4.54,0.87,0.14],["Rory Sparrow",4.5,1.3,2.9,0.7,0.1],["Sam Smith",8.6,1.8,1.4,0.8,0.2],["Sam Vincent",10.45,2.96,5.85,0.92,0.19],["Sam Worthen",3.7,1.8,1.8,0.9,0.1],["Scott May",9.49,3.19,1.42,0.69,0.1],["Scottie Pippen",11.02,4.9,2.77,1.54,0.75],["Sedale Threatt",7.21,1.25,3.34,0.84,0.15],["Sidney Green",9.2,6.09,1.07,0.57,0.39],["Steve Colter",4.9,1.6,3.5,0.7,0.2],["Steve Johnson",9.82,5.75,0.81,0.5,0.77],["Tracy Jackson",5.71,1.97,1.07,0.64,0.1],["Wallace Bryant",4.1,2.8,0.4,0.3,0.4],["Wes Matthews",5.7,0.9,4.5,0.9,0.2],["Will Perdue",2.2,1.5,0.4,0.1,0.2]]],
    ["CHI","1990s",[["Andrew Lang",3.8,4.4,0.6,0.2,0.6],["B.J. Armstrong",10.91,1.85,3.39,0.82,0.08],["Bill Cartwright",8.36,5.21,1.56,0.36,0.27],["Bill Wennington",5.11,2.74,0.62,0.32,0.24],["Bob Hansen",2.5,1.1,1,0.4,0],["Brent Barry",11.1,3.9,3.1,1.1,0.3],["Charles Davis",2.5,1.5,0.3,0.2,0.2],["Charles Jones",3.7,1.4,1.4,0.6,0.2],["Cliff Levingston",3.95,2.9,0.75,0.35,0.6],["Corey Benjamin",3.8,1.3,0.3,0.4,0.3],["Corey Williams",2.3,0.9,0.7,0.1,0.1],["Corie Blount",3.25,3.2,0.85,0.35,0.5],["Cory Carr",4.1,1.2,1.6,0.5,0.2],["Craig Hodges",5.29,0.61,1.34,0.44,0],["Darrell Walker",2.6,1.4,1.6,0.8,0.1],["Dennis Hopson",4.2,1.74,1.07,0.4,0.19],["Dennis Rodman",5.23,15.27,2.83,0.6,0.29],["Dickey Simpkins",4.4,3.24,0.76,0.28,0.14],["Ed Nealy",2.26,2.71,0.52,0.3,0.1],["Horace Grant",13.72,9.32,2.75,1.18,1.2],["James Edwards",3.5,1.4,0.4,0,0.3],["Jason Caffey",5.47,3.18,0.81,0.27,0.16],["Jeff Sanders",0.9,1.3,0.3,0.1,0.1],["Jo Jo English",3.58,1.12,0.96,0.35,0.27],["Joe Kleine",2,1.7,0.7,0.1,0.1],["John Paxson",7.31,1.14,3.17,0.72,0.06],["Jud Buechler",2.97,1.46,0.79,0.37,0.2],["Keith Booth",2.91,2.17,0.89,0.52,0.26],["Kornél Dávid",6.2,3.5,0.8,0.5,0.3],["Luc Longley",8.91,5.33,2.13,0.44,1.08],["Mark Bryant",9,5.2,1.1,0.8,0.4],["Michael Jordan",30.8,6.34,5.07,2.3,0.7],["Pete Myers",6.32,2.11,2.58,0.91,0.2],["Randy Brown",4.63,1.6,2.01,1.08,0.2],["Robert Parish",3.7,2.1,0.5,0.1,0.4],["Rodney McCray",3.5,2.5,1.3,0.2,0.2],["Ron Harper",7.88,3,2.59,1.3,0.53],["Rusty LaRue",4.41,1.13,1.23,0.65,0.1],["Scott Burrell",5.2,2.5,0.8,0.8,0.5],["Scott Williams",4.71,4.39,0.78,0.43,0.63],["Scottie Pippen",19.54,7.23,5.91,2.26,0.93],["Stacey King",6.63,3.3,1.01,0.37,0.47],["Steve Kerr",8.22,1.5,2.16,0.72,0.01],["Toni Kukoč",13.87,4.75,4.15,1.06,0.36],["Trent Tucker",5.2,1,1.2,0.3,0.1],["Will Perdue",4.8,4.27,0.87,0.25,0.59]]],
    ["CHI","2000s",[["A.J. Guyton",5.65,1.04,1.84,0.24,0.2],["Aaron Gray",3.92,3.33,0.75,0.3,0.3],["Adrian Griffin",2.33,2,0.94,0.58,0.08],["Andrés Nocioni",11.76,5.01,1.29,0.45,0.47],["Antonio Davis",7.9,6.94,1.48,0.4,0.74],["B.J. Armstrong",7.4,1.7,2.9,0.3,0],["Ben Gordon",18.55,3,3,0.8,0.16],["Ben Wallace",5.89,9.95,2.16,1.4,1.84],["Brad Miller",10.88,7.76,2.24,0.82,0.6],["Bryce Drew",6.3,1.4,3.9,0.7,0.1],["Charles Oakley",3.8,6,2,0.9,0.2],["Chris Anstey",6,3.8,0.9,0.4,0.3],["Chris Carr",9.8,3.2,1.6,0.6,0.3],["Chris Duhon",6.91,2.42,4.49,0.88,0.03],["Corey Benjamin",5.97,1.63,1.1,0.48,0.33],["Corie Blount",3.72,4.29,1,0.75,0.4],["Dalibor Bagarić",2.63,2.48,0.42,0.3,0.48],["Darius Songaila",9.2,4,1.4,0.6,0.3],["Derrick Rose",16.8,3.9,6.3,0.8,0.2],["Dickey Simpkins",4.2,5.4,1.4,0.3,0.3],["Donyell Marshall",12.6,8.52,1.8,1.13,1.13],["Dragan Tarlać",2.4,2.8,0.7,0.2,0.4],["Drew Gooden",13.43,8.86,1.51,0.76,0.79],["Eddie Robinson",6.72,2.63,1.1,0.82,0.24],["Eddy Curry",11.83,4.92,0.57,0.25,0.87],["Elton Brand",20.1,10.05,2.52,0.9,1.6],["Eric Piatkowski",3.96,1.08,0.68,0.34,0],["Fred Hoiberg",5.85,3.12,2.24,0.96,0.13],["Greg Anthony",8.4,2.4,5.6,1.4,0.1],["Hersey Hawkins",7.9,2.9,2.2,1.2,0.2],["Jalen Rose",21.4,4.22,4.75,0.93,0.35],["Jamal Crawford",11.21,2.42,3.85,1.04,0.3],["Jannero Pargo",6.41,1.35,2.11,0.44,0.05],["Jay Williams",9.5,2.6,4.7,1.1,0.2],["Jerome Williams",6.5,6.5,1.2,1.3,0.1],["Joakim Noah",6.65,6.64,1.2,0.74,1.16],["Joe Smith",11.2,5.3,0.9,0.5,0.6],["John Salmons",18.3,4.3,2,1,0.6],["Kendall Gill",9.6,3.4,1.6,1.2,0.3],["Kevin Ollie",5.8,2.5,3.7,0.7,0],["Khalid El-Amin",6.3,1.6,2.9,1,0],["Kirk Hinrich",13.87,3.39,6.07,1.32,0.31],["Kornél Dávid",6.5,2.8,0.6,0.5,0.1],["Larry Hughes",12,3.1,2.53,1.3,0.25],["Lindsey Hunter",2.6,0.4,1.3,0.7,0],["Linton Johnson",3.69,3.93,0.63,0.77,0.67],["Lonny Baxter",4.7,2.9,0.32,0.18,0.4],["Luke Schenscher",1.8,1.5,0.4,0.1,0.2],["Luol Deng",15.41,6.34,2.22,1,0.53],["Malik Allen",4.43,2.28,0.35,0.3,0.3],["Marcus Fizer",10.44,4.98,1.26,0.45,0.3],["Matt Maloney",6.4,1.3,2.7,0.6,0.1],["Metta World Peace",12.51,4.22,2.9,2,0.61],["Michael Ruffin",2.36,4.39,0.72,0.52,0.56],["Mike Sweetney",6.04,4.12,0.77,0.26,0.55],["Othella Harrington",6.38,3.14,0.65,0.2,0.25],["P.J. Brown",6.1,4.8,0.7,0.3,0.7],["Randy Brown",6.4,2.4,3.4,1,0.3],["Rick Brunson",3.23,1.03,2.17,0.67,0.13],["Roger Mason",1.68,0.74,0.74,0.22,0],["Ron Mercer",18.55,3.9,3.18,1.1,0.36],["Ronald Dupree",6.2,3.6,1.2,0.7,0.4],["Scottie Pippen",5.9,3,2.2,0.9,0.4],["Thabo Sefolosha",4.98,2.93,1.38,0.72,0.32],["Tim Thomas",5.59,2.16,0.7,0.26,0.04],["Toni Kukoč",18,5.4,5.2,1.8,0.8],["Travis Best",9.3,2.7,5,1.1,0],["Trenton Hassell",6.39,3.2,2,0.6,0.65],["Tyrus Thomas",7.69,4.94,0.94,0.81,1.35],["Tyson Chandler",7.04,7.69,0.88,0.57,1.43],["Viktor Khryapa",2.5,1.81,0.66,0.39,0],["Will Perdue",2.5,3.9,1,0.2,0.6]]],
    ["CHI","2010s",[["Aaron Brooks",9.54,1.77,2.93,0.56,0.15],["Antonio Blakeney",7.45,1.85,0.8,0.25,0.18],["Bobby Portis",9.7,5.82,1.06,0.48,0.31],["Brad Miller",8.8,4.9,1.9,0.5,0.4],["Brian Scalabrine",1.1,0.64,0.42,0.2,0.2],["C.J. Watson",6.7,1.47,2.97,0.77,0.14],["Cameron Bairstow",1.25,1,0.2,0.1,0.15],["Cameron Payne",6.73,2.08,3.16,0.72,0.24],["Carlos Boozer",15.51,9.04,2.06,0.82,0.35],["Chandler Hutchison",5.2,4.2,0.8,0.5,0.1],["Cristiano Felício",4.58,4.05,0.73,0.29,0.23],["D.J. Augustin",14.9,2.1,5,0.9,0],["Daequan Cook",2.5,1.3,0.3,0.1,0.2],["David Nwaba",7.9,4.7,1.5,0.8,0.4],["Denzel Valentine",8.03,4.04,2.31,0.67,0.1],["Derrick Rose",20.44,3.63,6.16,0.79,0.4],["Doug McDermott",8.19,2.3,0.67,0.2,0.08],["Dwyane Wade",18.3,4.5,3.8,1.4,0.7],["E'Twaun Moore",5.16,1.57,1.16,0.5,0.2],["Hakim Warrick",8.7,3.6,0.6,0.3,0.3],["Isaiah Canaan",4.6,1.3,0.9,0.6,0],["Jabari Parker",14.3,6.2,2.2,0.6,0.4],["James Johnson",3.78,1.97,0.77,0.35,0.7],["Jannero Pargo",5.5,1.2,1.4,0.5,0],["Jerian Grant",7.25,2.07,3.36,0.81,0.1],["Jimmy Butler",15.56,4.8,3.15,1.48,0.45],["Joakim Noah",10.29,10.44,3.64,0.86,1.5],["Joffrey Lauvergne",4.5,3.4,1,0.4,0],["John Lucas III",7.25,1.54,2.13,0.38,0],["John Salmons",12.7,3.4,2.5,1.3,0.4],["Justin Holiday",10.91,3.78,2.05,1.22,0.49],["Keith Bogans",4.4,1.8,1.2,0.5,0.1],["Kirk Hinrich",7.93,2.54,3.68,0.93,0.29],["Kris Dunn",12.41,4.21,6,1.77,0.5],["Kurt Thomas",4.1,5.8,1.2,0.6,0.8],["Kyle Korver",8.21,2.07,1.59,0.49,0.2],["Lauri Markkanen",16.72,8.15,1.29,0.64,0.6],["Luol Deng",16.97,6.48,2.75,1,0.61],["Marco Belinelli",9.6,1.9,2,0.6,0.1],["Marquis Teague",2.19,0.93,1.36,0.17,0.13],["Michael Carter-Williams",6.6,3.4,2.5,0.8,0.5],["Mike Dunleavy",9.9,3.83,1.94,0.68,0.44],["Mike James",2.9,0.75,2.05,0.3,0.1],["Nate Robinson",13.1,2.2,4.4,1,0.1],["Nazr Mohammed",1.92,2.47,0.31,0.24,0.41],["Nikola Mirotić",11.43,5.39,1.29,0.77,0.71],["Noah Vonleh",6.9,6.9,1,0.6,0.3],["Pau Gasol",17.54,11.42,3.37,0.44,1.95],["Paul Zipser",4.67,2.58,0.86,0.36,0.34],["Quincy Pondexter",2,1.2,0.4,0.3,0.1],["Rajon Rondo",7.8,5.1,6.7,1.4,0.2],["Richard Hamilton",10.45,1.95,2.62,0.46,0.06],["Robin Lopez",10.51,5,1.33,0.17,1.12],["Ronald Murray",10.1,2.9,1.8,0.6,0.1],["Ronnie Brewer",6.47,3.31,1.87,1.2,0.3],["Ryan Arcidiacono",5.63,2.31,2.89,0.73,0],["Shaquille Harrison",6.5,3,1.9,1.2,0.4],["Taj Gibson",9.4,6.38,1,0.52,1.25],["Timothé Luwawu-Cabarrot",6.8,2.7,0.8,0.5,0.2],["Tony Snell",5.25,2.32,0.93,0.37,0.23],["Tyrus Thomas",8.8,6.3,1.1,1.4,1.7],["Vladimir Radmanović",1.3,1.1,0.3,0.3,0.2],["Wayne Selden",8,3.2,1.7,0.5,0.2],["Wendell Carter Jr.",10.3,7,1.8,0.6,1.3],["Zach LaVine",21.77,4.48,4.09,1,0.34],["Ömer Aşık",2.88,4.36,0.44,0.33,0.82]]],
    ["CHI","2020s",[["Thaddeus Young",12.1,6.2,4.3,1.1,0.6],["DeMar DeRozan",25.5,4.7,5.1,1,0.5],["Patrick Beverley",6.2,3.7,2.9,0.9,0.6],["Garrett Temple",7.6,2.9,2.2,0.8,0.5],["Al-Farouq Aminu",4.4,4.8,1.3,0.8,0.4],["Tristan Thompson",6,5.1,0.6,0.4,0.4],["Nikola Vučević",19,10.9,3.4,0.8,0.8],["Andre Drummond",7.2,7.8,0.5,0.8,0.5],["Tomas Satoransky",7.7,2.4,4.7,0.7,0.2],["Zach LaVine",24,4.8,4.4,0.8,0.3],["Cristiano Felicio",1.3,1.4,0.5,0.2,0],["Denzel Valentine",6.5,3.2,1.7,0.5,0.1],["Guerschon Yabusele",5.6,3.5,0.9,0.4,0.2],["Ryan Arcidiacono",3.1,1.5,1.3,0.2,0],["Derrick Jones Jr.",5.3,2.8,0.6,0.5,0.6],["Alex Caruso",7.7,3.4,3.5,1.6,0.7],["Alfonzo McKinnie",3.5,1.9,0.3,0.1,0.2],["Lonzo Ball",10.3,4.4,4.2,1.6,0.7],["Lauri Markkanen",13.6,5.3,0.9,0.5,0.3],["Zach Collins",8.1,5,1.6,0.3,0.5],["Jordan Bell",0,1,0,1,0],["Tony Bradley",2.3,2.1,0.3,0.2,0.3],["Daniel Theis",9.6,5.5,1.7,0.6,0.9],["Torrey Craig",5.7,4.1,1.1,0.6,0.4],["Troy Brown Jr.",4.5,3.1,0.9,0.4,0.2],["Jevon Carter",4.7,1,1.2,0.5,0.2],["Kevin Huerter",9.9,3,2.3,1,0.3],["Collin Sexton",15.4,2.3,3.3,1.1,0.1],["Anfernee Simons",14.3,2.5,2.4,0.5,0.1],["Tyler Cook",3.4,2.7,0.2,0.2,0.2],["Coby White",15.4,3.6,4,0.7,0.2],["Devon Dotson",2.4,0.7,1,0.2,0],["Talen Horton-Tucker",6.5,1.7,1.4,0.4,0.2],["Adam Mokoka",1.1,0.4,0.4,0.1,0.1],["Matt Thomas",4,1.3,0.5,0.2,0.1],["Javonte Green",7,4,0.7,0.9,0.6],["Isaac Okoro",9.3,2.7,1.6,0.7,0.5],["Patrick Williams",9.1,3.9,1.4,0.8,0.6],["Jalen Smith",9.2,6.2,1.1,0.4,0.8],["Tre Jones",10.7,2.8,4.8,1,0.2],["Nick Richards",5.8,5.1,0.3,0.2,0.7],["Ayo Dosunmu",10.5,3,3.4,0.9,0.4],["Marko Simonovic",1.4,0.7,0,0.1,0.1],["Chris Duarte",2.1,1.2,0.5,0,0],["Josh Giddey",15.8,8.2,8.2,1.1,0.6],["E.J. Liddell",1.8,0.8,0.3,0.1,0.1],["Carlik Jones",2.9,0.7,0.9,0.3,0],["Mac McClung",6.1,0.9,0.9,1,0.3],["Terry Taylor",2.2,1.4,0.3,0.2,0.2],["Malcolm Hill",2.4,1.2,0.2,0.2,0.1],["Henri Drell",2.8,1,1,0.5,0.3],["Jaden Ivey",8.5,2.5,1.8,0.6,0.4],["Leonard Miller",7.8,3.9,0.9,0.4,0.3],["Dalen Terry",3.3,1.5,1.1,0.5,0.2],["Mouhamadou Gueye",8,3,3,1,0.5],["Julian Phillips",3.4,1.5,0.4,0.3,0.2],["Adama Sanogo",3,2.8,0.1,0.1,0],["Emanuel Miller",1.7,1.3,0.3,0.2,0],["Matas Buzelis",12.4,4.7,1.6,0.6,1.2],["Andrew Funk",0,0,0,0.2,0.2],["Onuralp Bitim",3.5,1.4,0.6,0.1,0.1],["Rob Dillingham",6.3,2,2.2,0.7,0.1],["Trentyn Flowers",2,0.5,0.5,0,0],["Jahmir Young",1.8,0.5,1,0,0],["Yuki Kawamura",3.4,1.8,2.6,0.5,0],["Noa Essengue",0,0,0,0.5,0],["Lachlan Olbrich",2.4,3,1.1,0.3,0.2]]],
    ["CLE","1970s",[["Austin Carr",16.75,3.16,2.99,0.86,0.13],["Barry Clemens",6,2.6,1.35,0.5,0],["Bingo Smith",13.26,4.27,2.2,0.79,0.32],["Bob Rule",4.39,2.82,1.15,0.5,0.4],["Bobby Lewis",5.9,2.6,3.1,null,null],["Bobby Washington",6.03,2.02,3.52,null,null],["Butch Beard",13.79,3.88,6.03,0.7,0.1],["Butch Lee",11.5,2,3.8,0.9,0],["Campy Russell",15.91,5.13,2.66,0.93,0.18],["Charlie Davis",9.58,1.44,1.97,null,null],["Cliff Anderson",3.4,1.6,0.7,null,null],["Cornell Warner",5.42,7.22,0.99,0,0.4],["Dave Sorenson",8.8,5.04,1.54,null,null],["Dick Snyder",10.65,2.07,2.38,0.62,0.41],["Dwight Davis",10.54,7.12,1.92,0.7,0.75],["Eddie Jordan",2.3,0.5,1.5,0.5,0],["Elmore Smith",10.51,7.21,0.59,0.5,1.92],["Foots Walker",6.73,2.77,4.31,1.62,0.18],["Fred Foster",5.97,1.68,1.27,0.3,0.04],["Gary Brokaw",7.2,1.5,3,0.4,0.3],["Gary Suiter",1.4,1.4,0.1,null,null],["Greg Howard",2.9,2.3,0.6,null,null],["Harry Davis",4.1,1.7,0.4,0.3,0.2],["Jackie Ridgle",1.8,0.5,0.2,null,null],["Jim Brewer",7.52,7.69,1.83,0.92,0.75],["Jim Chones",14.32,9.48,1.78,0.56,1.11],["Jim Cleamons",9.36,3.58,4.1,1.13,0.27],["Joe Cooke",4.3,1.6,1.3,null,null],["John Johnson",15.96,7.08,4.55,null,null],["John Lambert",3.51,3.3,0.49,0.31,0.42],["John Warren",6.59,2.53,2.05,0.4,0.1],["Johnny Egan",4,1.2,2.2,null,null],["Kenny Higgs",5,1.5,2.1,1,0.2],["Larry Mikan",3,2.6,0.8,null,null],["Lenny Wilkens",18.46,4.15,7.75,1.3,0.2],["Luke Witte",3.16,3.04,0.51,0.08,0.39],["Luther Rackley",7.06,4.97,0.83,null,null],["McCoy McLemore",11.7,8,3,null,null],["Mike Mitchell",10.7,4.1,0.8,0.6,0.4],["Nate Thurmond",4.99,6.29,1.3,0.3,1.47],["Rick Roberson",12.85,11.96,1.95,null,null],["Rowland Garrett",3.11,1.17,0.2,0.32,0.1],["Steve Patterson",4.65,4.81,1.23,0.43,0.48],["Terry Furlow",11.01,2,1.74,0.59,0.3],["Walt Frazier",15.17,3.64,3.83,1.42,0.28],["Walt Wesley",14.23,8.33,0.93,null,null]]],
    ["CLE","1980s",[["Austin Carr",11.8,2.1,1.9,0.5,0],["Ben McDonald",2.9,1.8,0.4,0.3,0],["Ben Poquette",4.97,4.47,0.97,0.43,0.57],["Bill Laimbeer",8.62,7.42,2.01,0.59,0.85],["Bill Willoughby",6.9,4.2,0.9,0.4,0.8],["Bob Wilkerson",8.67,3.42,3,1.13,0.29],["Brad Daugherty",17.75,8.56,3.9,0.67,0.67],["Bruce Flowers",4.9,3.4,0.9,0.4,0.2],["Campy Russell",17.1,5.24,3.98,1.68,0.47],["Chad Kinch",2.8,0.8,1.2,0.3,0.2],["Chris Dudley",3.05,2.6,0.35,0.15,0.35],["Cliff Robinson",17.64,10.53,2.09,0.86,0.74],["Craig Ehlo",7.03,3.58,2.73,1.1,0.38],["Darnell Valentine",4.8,1.3,2.3,0.7,0.1],["Darren Tillis",4.1,3.3,0.4,0.2,0.8],["Dave Robisch",14.6,7.96,2.5,0.6,0.59],["Dell Curry",10,2.1,1.9,1.2,0.3],["Dirk Minniefield",5.12,1.6,3.21,0.85,0.01],["Don Ford",3.78,2.72,1.16,0.3,0.18],["Earl Tatum",2.6,0.8,0.6,0.5,0.2],["Eddie Johnson",9.8,1.4,3.6,0.3,0],["Edgar Jones",9.21,4,0.67,0.53,0.6],["Foots Walker",9.4,3.8,8,2,0.2],["Geoff Huston",10.41,1.65,6.11,0.72,0.06],["Hot Rod Williams",12.38,6.76,1.5,0.8,1.86],["James Edwards",15.98,7.32,1.49,0.33,1.4],["James Silas",11.2,1.6,3.3,0.6,0.1],["Jeff Cook",6.14,6.18,1.47,0.75,0.59],["John Bagley",9.46,2.86,6.18,1.28,0.1],["John Garris",4,2.3,0.3,0.2,0.2],["John Lambert",5.27,4.65,0.81,0.58,0.58],["Johnny Davis",10.57,1.36,4.62,0.6,0.1],["Johnny Newman",5,1.2,0.5,0.3,0.1],["Johnny Rogers",2.6,1.1,0.1,0.2,0.1],["Keith Herron",2.8,0.7,0.8,0.3,0.1],["Keith Lee",6.7,4.81,1.09,0.45,0.6],["Kenny Carr",14.09,8.95,1.66,0.99,0.53],["Kevin Johnson",7.3,1.4,3.7,1.2,0.3],["Kevin Restani",1.6,2.3,0.4,0.3,0.2],["Kevin Williams",3.5,1.4,1.3,0.5,0.1],["Kim Hughes",0.7,1.7,0.5,0.4,0.5],["Larry Kenon",7.3,3.7,1.1,0.7,0.3],["Larry Nance",16.93,7.97,2.44,0.77,2.66],["Lonnie Shelton",7.87,4.4,1.89,0.81,0.43],["Mack Calvin",2.5,0.6,1.3,0.2,0],["Mark Price",14.23,2.36,5.91,1.12,0.14],["Mark West",5.69,4.49,0.46,0.34,1],["Melvin Turpin",10.42,5.39,0.57,0.52,1.03],["Mickey Dillard",2.2,0.5,1,0.2,0.1],["Mike Bratz",10,2.5,5.7,1.7,0.2],["Mike Mitchell",22.82,6.45,1.4,0.87,0.73],["Mike Sanders",8.73,3.32,1.49,0.96,0.35],["Paul Mokeski",4.29,4.41,0.72,0.61,0.78],["Paul Thompson",9.43,3.71,1.59,0.99,0.53],["Phil Hubbard",10.58,5.03,1.22,0.89,0.09],["Randolph Keys",4,1.3,0.5,0.3,0.1],["Randy Smith",16.1,2.75,4.4,1.45,0.15],["Reggie Johnson",9.7,5.4,1,0.3,0.7],["Richard Washington",9.11,5.07,1.43,0.56,0.66],["Roger Phegley",13.11,2.9,2.15,0.75,0.18],["Ron Anderson",5.58,2.11,0.77,0.24,0.14],["Ron Brewer",12.55,1.88,1.75,0.91,0.35],["Ron Harper",19.37,4.64,5.01,2.32,0.94],["Roy Hinson",13.65,7.26,1,0.63,1.82],["Sam Lacey",4.2,3.9,2,0.5,0.4],["Scooter McCray",3.3,2.4,1,0.4,0.2],["Scott Wedman",13.73,5.72,2.5,1.12,0.3],["Steve Hayes",3.6,3.6,0.6,0.3,0.6],["Stewart Granger",4.5,1,2.4,0.4,0],["Tree Rollins",2.3,2.3,0.3,0.2,0.6],["Tyrone Corbin",6.07,3.69,0.81,0.69,0.23],["Walter Jordan",2.3,1.4,0.4,0.4,0.2],["Willie Smith",4.8,2,4.2,1.2,0],["World B. Free",23.02,2.93,3.85,1.26,0.2]]],
    ["CLE","1990s",[["Andrew DeClercq",9,5.8,0.6,1.1,0.6],["Antonio Lang",2.61,1.72,0.39,0.4,0.39],["Bob Sura",6.44,2.48,3.67,0.92,0.31],["Bobby Phills",10.55,3.01,2.5,1.2,0.28],["Brad Daugherty",19.88,10.27,3.56,0.84,0.77],["Brevin Knight",9.2,3.27,8.04,2.27,0.2],["Carl Thomas",2.07,1.06,0.34,0.4,0.16],["Cedric Henderson",9.72,3.96,2.11,1.2,0.5],["Chris Dudley",5,5.5,0.5,0.5,1.1],["Chris Mills",12.56,5.35,2.1,0.85,0.55],["Chucky Brown",7.69,2.92,0.88,0.4,0.29],["Corie Blount",3.4,5.3,0.5,0.9,0.6],["Craig Ehlo",11.87,4.98,4.04,1.41,0.33],["Dan Majerle",10.6,3.7,2.6,1,0.4],["Danny Ferry",7.85,2.91,1.49,0.47,0.34],["Darnell Valentine",9.4,2.6,5.4,1.5,0.2],["Derek Anderson",11.37,2.84,3.55,1.3,0.16],["Derrick Chievous",2.88,1.04,0.19,0.2,0.1],["Donny Marshall",2.8,1.11,0.32,0.32,0.1],["Fred Roberts",3.8,1.6,0.4,0.3,0.1],["Gerald Madkins",1.48,0.38,0.71,0.38,0],["Gerald Paddio",7.2,1.7,1.3,0.3,0.1],["Gerald Wilkins",12.72,3.21,2.7,1.15,0.35],["Greg Dreiling",1.9,2,0.4,0.1,0.4],["Henry James",6.13,1.56,0.5,0.21,0.13],["Hot Rod Williams",13.14,7.26,2.37,0.91,1.79],["Jay Guidinger",1.55,1.5,0.3,0.2,0.25],["Jerome Lane",2.8,2.5,0.8,0.6,0.1],["Jimmy Oliver",3.6,1,0.7,0.3,0.1],["Joe Courtney",1.7,2.1,0.4,0.2,0.3],["John Amaechi",2.8,1.9,0.3,0.2,0.4],["John Battle",7.43,0.99,1.69,0.38,0.06],["John Crotty",3,0.9,1.8,0.4,0.1],["John Morton",4.81,1.37,2.95,0.74,0.22],["Johnny Newman",6.1,1.5,0.8,0.6,0.2],["Larry Nance",16.71,8.33,2.73,0.84,2.47],["Mark Price",17.74,2.8,8.03,1.34,0.12],["Mark West",3.2,2.7,0.3,0.2,0.8],["Michael Cage",5.5,7.9,0.65,0.9,0.9],["Mike Sanders",8.77,3.48,1.57,0.79,0.54],["Mitchell Butler",4.19,1.33,0.81,0.46,0.06],["Paul Mokeski",4,2.6,0.4,0.2,0.3],["Randolph Keys",7.6,2.9,0.8,0.8,0],["Reggie Geary",1.5,0.4,0.9,0.3,0.1],["Reggie Williams",6.8,1.9,1.2,0.7,0.3],["Rod Higgins",5.4,2.3,1,0.7,0.4],["Scott Brooks",1.8,0.7,1.1,0.4,0.1],["Shawn Kemp",18.86,9.27,2.47,1.3,1.1],["Shawnelle Scott",1.16,1.29,0.14,0.07,0.2],["Steve Colter",3.4,1,1.8,0.5,0.1],["Steve Kerr",5.98,1.17,2.67,0.56,0.12],["Terrell Brandon",12.68,2.72,4.9,1.39,0.3],["Tony Campbell",6,2,0.9,0.4,0.1],["Tree Rollins",2.6,3.2,0.5,0.3,1.1],["Tyrone Hill",11.71,9.14,0.92,0.84,0.52],["Vitaly Potapenko",6.64,3.51,0.63,0.33,0.45],["Wesley Person",13.46,3.97,2.12,1.32,0.53],["Winston Bennett",4.81,3.08,0.88,0.38,0.18],["Zydrunas Ilgauskas",13.97,8.8,0.89,0.61,1.59]]],
    ["CLE","2000s",[["Alan Henderson",2.5,2.7,0.2,0.2,0.2],["Anderson Varejão",6.58,6.47,0.81,0.82,0.62],["Andre Miller",14.46,4.16,8.22,1.37,0.3],["Andrew DeClercq",6.6,5.4,0.7,0.8,0.8],["Anthony Johnson",2.4,0.8,1.6,0.2,0],["Ben Wallace",3.27,6.75,0.74,0.9,1.41],["Bimbo Coles",4.21,1.32,2.62,0.46,0.12],["Bob Sura",13.8,3.9,3.9,1.2,0.3],["Brevin Knight",8.64,2.85,6.76,1.55,0.29],["Brian Skinner",3.4,4.3,0.3,0.4,0.9],["Bryant Stith",4.2,1.7,0.8,0.6,0.1],["Carlos Boozer",12.64,9.38,1.64,0.84,0.65],["Cedric Henderson",4.88,1.97,1.14,0.55,0.35],["Chris Gatling",11.4,5.3,0.8,0.7,0.4],["Chris Mihm",7.13,5.02,0.37,0.27,0.97],["Chucky Brown",3.9,1.8,0.3,0.3,0.3],["Clarence Weatherspoon",11.3,9.7,1.3,1,1.3],["Dajuan Wagner",9.41,1.37,1.94,0.68,0.13],["Damon Jones",6.61,1.3,1.89,0.38,0],["Daniel Gibson",7.59,1.97,1.82,0.6,0.17],["Danny Ferry",7.3,3.8,1.1,0.3,0.4],["Darius Miles",9.09,5.08,2.46,0.89,0.89],["Darnell Jackson",1.9,1.7,0.2,0.2,0.1],["David Wesley",2.1,1,1.1,0.3,0.1],["DeSagana Diop",1.62,2.61,0.49,0.36,0.87],["Delonte West",11.3,3.34,3.79,1.38,0.34],["Devin Brown",7.5,3.4,2.2,0.7,0.1],["Donyell Marshall",7.87,4.9,0.64,0.57,0.52],["Drew Gooden",11.95,8.63,1.11,0.81,0.63],["Dwayne Jones",1.36,2.43,0.19,0.19,0.37],["Earl Boykins",5.3,1,1.8,0.5,0],["Eric Snow",4.06,2.09,3.86,0.78,0.2],["Eric Williams",9.4,3.8,1.9,1,0.2],["Ira Newble",4.18,2.51,0.8,0.5,0.23],["J.J. Hickson",4,2.7,0.1,0.2,0.5],["J.R. Bremer",3.5,1.1,1.3,0.6,0.1],["Jason Kapono",3.5,1.3,0.3,0.3,0],["Jeff McInnis",12.48,2.24,5.8,0.84,0.03],["Jim Jackson",10.3,3.7,2.9,0.9,0.2],["Joe Smith",7.4,4.91,0.74,0.3,0.64],["Jumaine Jones",9.05,5.55,1.4,0.85,0.45],["Kedrick Brown",5.3,2.3,1.1,0.4,0.1],["Kevin Ollie",4.2,2.1,2.9,0.6,0.1],["Lamond Murray",15.04,5.09,1.86,1.17,0.46],["Larry Hughes",14.34,3.92,3.32,1.4,0.42],["LeBron James",27.52,7.01,6.68,1.75,0.85],["Lee Nailon",7.7,3,0.8,0.2,0],["Lucious Harris",4.3,1.7,0.7,0.4,0.1],["Luke Jackson",2.74,0.99,0.61,0.23,0.08],["Mark Bryant",5.7,4.7,0.8,0.4,0.4],["Matt Harpring",11.1,4.3,1.8,0.8,0.3],["Michael Doleac",4.6,4,0.6,0.4,0.3],["Michael Stewart",0.83,1.36,0.09,0.01,0.4],["Mike Wilks",1.1,0.7,0.5,0.2,0],["Milt Palacio",5,2.9,3.2,0.9,0.2],["Mo Williams",17.8,3.4,4.1,0.9,0.1],["Ricky Davis",15.97,4.12,3.96,1.18,0.4],["Robert Traylor",5.6,4.4,0.85,0.7,0.89],["Ronald Murray",13.5,2.4,2.8,1.4,0.3],["Ryan Stack",2.1,1.8,0.2,0.2,0.4],["Sasha Pavlović",6.07,1.87,1.13,0.5,0.17],["Scot Pollard",1,1.3,0.1,0.2,0],["Shannon Brown",4.7,1.02,0.68,0.46,0.1],["Shawn Kemp",17.8,8.8,1.7,1.2,1.2],["Smush Parker",6.2,1.8,2.5,0.7,0.2],["Tarence Kinsey",2,0.8,0.2,0.2,0],["Tony Battie",5.4,4.8,0.7,0.4,0.9],["Trajan Langdon",5.46,1.37,1.27,0.48,0.09],["Tyrone Hill",7.06,9.29,0.96,0.87,0.56],["Wally Szczerbiak",7.3,3.13,1.18,0.4,0.15],["Wesley Person",11.03,3.47,1.89,0.72,0.34],["Zydrunas Ilgauskas",14.41,7.73,1.31,0.54,1.74]]],
    ["CLE","2010s",[["Alec Burks",11.6,5.5,2.9,0.7,0.5],["Alonzo Gee",8.27,3.79,1.29,1.04,0.32],["Anderson Varejão",8.74,8.66,1.62,0.97,0.71],["Andrew Bynum",8.4,5.3,1.1,0.3,1.2],["Antawn Jamison",17.27,6.69,1.77,0.89,0.59],["Ante Žižić",6.36,4.17,0.65,0.16,0.4],["Anthony Bennett",4.2,3,0.3,0.4,0.2],["Anthony Parker",7.63,2.89,2.41,0.81,0.14],["Brandon Knight",8.5,1.9,2.3,0.7,0.1],["Brendan Haywood",1.6,1.3,0.1,0.1,0.5],["C.J. Miles",10.63,2.39,1,0.84,0.3],["Cedi Osman",8.95,3.5,1.75,0.62,0.06],["Channing Frye",6.72,3.01,0.66,0.35,0.34],["Christian Eyenga",6.25,2.7,0.79,0.76,0.61],["Collin Sexton",16.7,2.9,3,0.5,0.1],["Daniel Gibson",8.04,2,2.13,0.62,0.23],["Danny Green",2,0.9,0.3,0.3,0.2],["Darnell Jackson",0.8,0.7,0.1,0.1,0.1],["David Nwaba",6.5,3.2,1.1,0.7,0.3],["DeAndre Liggins",2.4,1.7,0.9,0.7,0.2],["Delonte West",8.8,2.8,3.3,0.9,0.5],["Deron Williams",7.5,1.9,3.6,0.3,0.3],["Derrick Williams",6.2,2.3,0.6,0.2,0.1],["Dion Waiters",14.37,2.43,2.84,1.02,0.26],["Donald Sloan",5.49,1.96,2.9,0.36,0.06],["Dwyane Wade",11.2,3.9,3.5,0.9,0.7],["Earl Clark",5.2,2.8,0.4,0.4,0.4],["George Hill",9.89,2.49,2.8,0.9,0.42],["Henry Sims",2.2,2.8,0.3,0.3,0.4],["Iman Shumpert",6.69,3.35,1.49,0.95,0.37],["J.J. Hickson",11.13,6.79,0.8,0.5,0.6],["J.R. Smith",10.31,2.91,1.85,1.07,0.26],["Jae Crowder",8.6,3.3,1.1,0.8,0.2],["Jamario Moon",4.82,3.06,0.92,0.6,0.58],["James Jones",3.68,0.97,0.34,0.17,0.16],["Jared Cunningham",2.6,0.7,0.5,0.3,0.1],["Jarrett Jack",9.5,2.8,4.1,0.7,0.3],["Jawad Williams",4.07,1.6,0.66,0.23,0.1],["Jeff Green",10.8,3.2,1.3,0.5,0.4],["Jeremy Pargo",7.8,1.3,2.6,0.5,0.1],["Joe Harris",2.51,0.78,0.49,0.09,0],["Joey Graham",5.2,2.2,0.5,0.2,0.2],["Jordan Clarkson",15.72,2.99,2.22,0.7,0.17],["Jordan McRae",4.31,1.01,0.64,0.14,0.17],["José Calderón",4.5,1.5,2.1,0.5,0],["Kay Felder",4,1,1.4,0.4,0.2],["Kevin Jones",3,2.4,0.3,0.3,0.2],["Kevin Love",17.11,10.05,2.09,0.74,0.44],["Kyle Korver",9.31,2.38,1.13,0.35,0.3],["Kyrie Irving",21.6,3.39,5.55,1.33,0.33],["Larry Nance Jr.",9.27,7.88,2.62,1.42,0.65],["LeBron James",26.88,7.62,8.15,1.44,0.76],["Leon Powe",4.41,2.94,0.04,0.38,0.14],["Luke Harangody",4.55,3.35,0.65,0.4,0.3],["Luke Walton",2.99,2.55,2.74,0.59,0.21],["Luol Deng",14.3,5.1,2.5,1,0.1],["Manny Harris",6.16,2.63,1.47,0.57,0.13],["Marquese Chriss",5.7,4.2,0.6,0.6,0.3],["Marreese Speights",10.2,5.1,0.7,0.4,0.7],["Matthew Dellavedova",5.95,1.9,3.48,0.47,0.07],["Mike Dunleavy",4.6,2,0.9,0.3,0.1],["Mike Miller",2.1,1.8,0.9,0.3,0.1],["Mo Williams",13.05,2.59,4.93,0.78,0.24],["Nik Stauskas",5.5,2,0.8,0.3,0.1],["Omri Casspi",5.87,3.18,0.88,0.6,0.3],["Ramon Sessions",12.36,3.1,5.2,0.7,0.07],["Richard Jefferson",5.6,2.16,0.9,0.35,0.15],["Rodney Hood",11.75,2.53,1.81,0.77,0.13],["Ryan Hollins",4.89,2.6,0.37,0.27,0.57],["Samardo Samuels",5.85,3.36,0.43,0.37,0.4],["Semih Erden",3.48,2.62,0.3,0.41,0.28],["Sergey Karasev",1.7,0.7,0.3,0.1,0],["Shaquille O'Neal",12,6.7,1.5,0.3,1.2],["Shaun Livingston",7.2,2.5,3.6,0.8,0.6],["Shawn Marion",4.8,3.5,0.9,0.5,0.5],["Spencer Hawes",13.5,7.7,2.4,0.5,1],["Timofey Mozgov",7.92,5.34,0.55,0.34,0.95],["Tristan Thompson",9.17,8.57,0.91,0.51,0.7],["Tyler Zeller",6.85,4.89,0.87,0.4,0.71],["Wayne Ellington",10.4,3,1.6,0.8,0.1],["Zydrunas Ilgauskas",7.4,5.4,0.8,0.2,0.8]]],
    ["CLE","2020s",[["Anderson Varejão",2.6,4,0.6,0,0.4],["Rajon Rondo",4.8,2.8,4.4,0.8,0.2],["Kevin Love",12.9,7.3,2.4,0.5,0.2],["Robin Lopez",3,1.4,0.5,0.1,0.2],["James Harden",23.6,4.8,8,1.1,0.4],["Ricky Rubio",5.2,2.1,3.5,0.8,0.2],["Danny Green",5.5,1.3,0.5,0.5,0.3],["Ed Davis",0.9,2.1,0.2,0.1,0.3],["Tristan Thompson",2.5,3.5,0.8,0.2,0.3],["Marcus Morris Sr.",6.4,2.7,0.7,0.3,0.3],["Dennis Schröder",10.8,2.7,4.9,0.8,0.2],["Matthew Dellavedova",2.8,1.8,4.5,0.3,0.1],["Raul Neto",3.3,1,1.6,0.4,0.1],["Tim Frazier",3.3,1.6,2.8,0.3,0.1],["Quinn Cook",3.3,0.7,0.8,0.2,0],["Larry Nance Jr.",6.5,4.7,2,1.1,0.3],["Cedi Osman",9.9,2.6,2.1,0.7,0.2],["Damian Jones",2.7,1.6,0.4,0.2,0.3],["Caris LeVert",14.4,3.9,4.4,1,0.4],["Thon Maker",3.8,2.3,0.5,0.3,0.5],["Taurean Prince",9.5,3.5,1.9,0.7,0.6],["Georges Niang",9.4,3.4,1.2,0.4,0.2],["Lonzo Ball",4.6,4,3.9,1.3,0.3],["Lauri Markkanen",14.8,5.7,1.3,0.7,0.5],["Donovan Mitchell",26.7,4.6,5.3,1.5,0.3],["Jarrett Allen",14.8,9.9,1.9,0.8,1.1],["Isaiah Hartenstein",5.1,3.9,1.2,0.4,0.8],["Thomas Bryant",6.2,3.4,0.6,0.3,0.4],["Damyean Dotson",6.7,2,2,0.3,0.1],["Malik Newman",8,1,1,0,0],["Collin Sexton",20.1,3.2,3.2,0.9,0.1],["Brandon Goodwin",4.8,1.9,2.5,0.7,0],["Mamadi Diakite",2.6,1.4,0.4,0.2,0.4],["Tacko Fall",1.1,2.1,0.2,0,0.5],["Max Strus",10.9,4.8,3.1,0.6,0.2],["De'Andre Hunter",17,4,1.4,0.8,0.2],["Darius Garland",19.9,2.8,7.1,1.2,0.1],["Chuma Okeke",5.9,5.2,1.7,0.6,0.4],["Moses Brown",4.3,3.4,0,0.2,0.4],["Ty Jerome",7.2,1.5,2.5,0.6,0],["Mfiondu Kabengele",2.4,1.5,0.4,0.2,0.3],["Dylan Windler",3,1.8,0.7,0.4,0.2],["Marques Bolden",1.2,1,0,0.3,0.3],["Jeremiah Martin",2.4,0.8,0.4,0.6,0.2],["Dean Wade",5.4,3.7,1.1,0.7,0.4],["Javonte Green",5.1,3.2,0.8,1,0.5],["Isaac Okoro",8.1,2.8,1.6,0.8,0.4],["Lamar Stevens",5.2,2.8,0.6,0.4,0.3],["Sam Merrill",8.2,2.1,1.7,0.6,0.1],["Brodric Thomas",3.9,1.7,0.9,0.5,0.3],["Trevon Scott",3,1,0,0.5,0.5],["Evan Mobley",16.7,9,3.1,0.8,1.6],["Isaiah Mobley",2.5,1.4,0.4,0.2,0.1],["Ruben Nembhard Jr.",1.1,0.5,0.9,0.1,0],["Kevin Pangos",1.6,0.5,1.3,0.1,0],["Olivier Sarr",3.5,2.8,1.3,0.5,0.8],["Keon Ellis",6.7,1.9,1,1.2,0.6],["Luke Travers",1.6,1.9,0.8,0.3,0.2],["Pete Nance",0.4,0.4,0,0.1,0],["Emoni Bates",3.2,0.8,0.8,0.1,0.1],["Chris Livingston",3,1,0.3,0.3,0],["Nae'Qwan Tomlin",6.5,3.5,0.6,0.3,0.3],["Craig Porter Jr.",4.6,2.3,2.3,0.5,0.4],["Jaylon Tyson",8.4,3.5,1.6,0.6,0.2],["Tristan Enaruna",4.1,1.6,0.8,0.6,0],["Riley Minix",3.9,0.7,0.6,0.2,0.1],["Darius Brown",0,1,0,0,0],["Tyrese Proctor",5.4,1.3,1.5,0.5,0]]],
    ["DAL","1980s",[["Abdul Jeelani",8.4,3.5,1,0.7,0.5],["Adrian Dantley",20.3,4.9,2.5,0.6,0.2],["Al Wood",6.6,1.7,0.6,0.4,0.2],["Allan Bristow",5.69,3.32,4.38,0.61,0.07],["Anthony Jones",2.6,0.8,0.5,0.4,0.1],["Bill Garnett",5.68,4.73,1.5,0.6,0.85],["Bill Robinzine",13.9,7.4,1.6,1,0.1],["Bill Wennington",3.39,2.81,0.45,0.2,0.36],["Brad Davis",9.52,2.06,5.71,0.88,0.15],["Charlie Sitton",2.1,1.4,0.6,0.2,0.1],["Clarence Kea",3.87,2.48,0.37,0.19,0.1],["Corny Thompson",2.8,2.7,0.8,0.3,0.2],["Dale Ellis",8.2,3.09,0.7,0.6,0.1],["Derek Harper",12.93,2.63,5.85,1.86,0.38],["Detlef Schrempf",8.33,3.57,1.87,0.52,0.26],["Elston Turner",5.44,2.96,1.84,0.79,0],["Geoff Huston",16.1,1.8,4.9,0.8,0.1],["Herb Williams",6.6,6.6,1.2,0.5,1.8],["James Donaldson",8.8,10.4,0.88,0.48,1.52],["Jay Vincent",16.91,6.47,2.24,0.8,0.35],["Jim Farmer",2,0.6,0.5,0.1,0],["Jim Spanarkel",10.53,2.75,2.36,1.06,0.13],["Kelvin Ransey",11.1,1.9,3.7,0.8,0.1],["Kurt Nimphius",6.24,5.26,1.69,0.37,1.49],["Mark Aguirre",24.62,5.72,3.82,0.9,0.4],["Mark West",1.1,1.4,0.4,0,0.4],["Marty Byrnes",7.8,2.5,1.6,0.4,0.2],["Morlon Wiley",2.2,0.9,1.5,0.5,0.1],["Ollie Mack",9.02,3.3,2.34,0.81,0.1],["Pat Cummings",12.8,8.2,1.9,0.75,0.35],["Rolando Blackman",19.26,3.66,3.12,0.76,0.34],["Roy Tarpley",11.34,9.75,0.91,1.06,1.15],["Sam Perkins",14.06,8.09,1.7,1.02,0.98],["Scott Lloyd",6.04,4.12,1.53,0.35,0.22],["Stan Pietkiewicz",3.9,1.1,2.1,0.4,0.1],["Steve Alford",1.78,0.68,0.85,0.48,0.08],["Terry Tyler",5.5,3,0.6,0.3,0.6],["Tom LaGarde",11.11,6.79,2.21,0.4,0.46],["Tom Sluby",2.4,0.4,0.5,0.1,0],["Uwe Blab",2.16,1.61,0.42,0.1,0.36],["Wallace Bryant",2.93,4.22,1.46,0.39,0.37],["Wayne Cooper",9,7.2,1.5,0.5,1.4],["Winford Boynes",6.5,1.7,0.8,0.5,0.4]]],
    ["DAL","1990s",[["A.C. Green",6.84,7.53,1.06,0.86,0.27],["Adrian Dantley",14.7,3.8,1.8,0.4,0.2],["Alex English",9.7,3.2,1.3,0.5,0.3],["Anthony Jones",3,1.2,0.4,0.5,0.2],["Bill Wennington",4.5,3.3,0.7,0.3,0.4],["Brad Davis",5.33,1.33,2.9,0.55,0.14],["Brian Howard",6.05,2.76,0.86,0.69,0.44],["Bubba Wells",3.3,1.7,0.9,0.4,0.1],["Cedric Ceballos",14.61,6.26,1.48,0.69,0.54],["Cherokee Parks",3.9,3.4,0.5,0.4,0.5],["Chris Anstey",4.6,3.1,0.8,0.6,0.5],["Chris Gatling",19.1,7.9,0.6,0.8,0.7],["David Wood",4.9,3.6,0.7,0.4,0.2],["Dennis Scott",13.6,3.8,2.5,0.8,0.6],["Derek Harper",16.32,2.47,5.86,1.68,0.25],["Dexter Cambridge",7,3.2,1.1,0.5,0.1],["Dirk Nowitzki",8.2,3.4,1,0.6,0.6],["Donald Hodge",4.81,3.28,0.77,0.34,0.42],["Doug Smith",8.31,4.34,1.42,0.79,0.54],["Eric Montross",3.9,5,0.7,0.2,0.7],["Eric Riley",3.6,3.4,0.6,0.4,1.2],["Erick Strickland",8.23,2.6,2.32,0.95,0.12],["Fat Lever",8.06,3.96,2.85,1.85,0.27],["Gary Trent",16,7.8,1.7,0.6,0.5],["George McCloud",15.17,4.13,2.21,1.14,0.35],["Greg Dreiling",2.23,2.59,0.47,0.26,0.31],["Herb Williams",10.69,5.58,1.46,0.54,1.36],["Hot Rod Williams",1.2,3.3,0.6,0.5,0.7],["Hubert Davis",10.34,1.95,1.86,0.46,0.1],["Jamal Mashburn",19.9,4.18,3.31,1,0.15],["James Donaldson",8.83,8.17,0.78,0.32,0.89],["Jason Kidd",13.66,5.87,8.76,2.05,0.31],["Jim Jackson",19.59,4.86,3.78,0.9,0.29],["John Shasky",2.6,2.4,0.2,0.2,0.4],["Kelvin Upshaw",5.31,1.04,1.69,0.56,0.09],["Khalid Reeves",8.58,2.31,3.01,0.97,0.11],["Loren Meyer",4.81,4.02,0.72,0.3,0.36],["Lorenzo Williams",3.49,7.82,1.28,0.6,1.72],["Lucious Harris",7.6,2.29,1.48,0.64,0.11],["Martin Müürsepp",5.09,2.41,0.61,0.57,0.3],["Michael Finley",19.52,5.06,4.14,1.31,0.37],["Mike Iuzzolino",8.96,1.96,4.27,0.66,0.06],["Morlon Wiley",4.04,1.21,2.2,0.91,0],["Oliver Miller",4.3,5.5,1.4,0.8,1.2],["Popeye Jones",9.01,9.56,1.69,0.66,0.37],["Randy White",7.42,4.85,0.64,0.74,0.46],["Robert Pack",9.58,2.26,4.39,1.34,0.09],["Rodney McCray",10.19,6.9,3.2,0.75,0.55],["Rolando Blackman",19.22,3.3,3.38,0.87,0.27],["Roy Tarpley",14.77,10.43,1.33,1.25,1.3],["Sam Perkins",15.9,7.5,2.3,1.2,0.8],["Samaki Walker",6.59,4.83,0.4,0.4,0.63],["Scott Brooks",5.97,0.94,1.9,0.66,0.03],["Sean Rooks",12.67,6.65,1.18,0.46,1.02],["Shawn Bradley",11.18,8.2,0.89,0.7,3.13],["Steve Alford",4.24,0.65,0.82,0.31,0.05],["Steve Bardo",2.2,1.6,1.3,0.3,0.1],["Steve Nash",7.9,2.9,5.5,0.9,0.1],["Terry Davis",8.52,7.41,0.69,0.39,0.28],["Tim Legler",8.66,1.68,1.5,0.73,0.2],["Tony Campbell",9.7,3.1,1.2,0.7,0.3],["Tony Dumas",7.8,1.34,1.26,0.44,0.15],["Tracy Moore",7.87,1.66,1.15,0.66,0.1],["Walter Bond",8,2.6,1.6,1,0.2],["Walter Palmer",3,2.2,0.3,0.1,0.3]]],
    ["DAL","2000s",[["Adrian Griffin",5.34,3.92,1.61,1.09,0.16],["Alan Henderson",3.5,4.5,0.3,0.4,0.5],["Antawn Jamison",14.8,6.3,0.9,1,0.4],["Anthony Johnson",3.8,1.2,2,0.4,0],["Antoine Walker",14,8.3,4.5,0.8,0.8],["Antoine Wright",6.59,1.99,1.14,0.59,0.38],["Austin Croshere",3.7,3,0.7,0.2,0.1],["Avery Johnson",3.27,0.52,1.38,0.3,0.03],["Brandon Bass",8.4,4.45,0.6,0.3,0.65],["Calvin Booth",3.96,2.65,0.47,0.45,0.96],["Cedric Ceballos",16.6,6.7,1.3,0.8,0.3],["Christian Laettner",7.5,4,1.3,0.8,0.5],["Courtney Alexander",4.2,1.7,0.6,0.4,0.1],["D.J. Mbenga",1.33,0.94,0.08,0.08,0.44],["Damon Jones",3.9,0.9,1.4,0.3,0],["Danny Fortson",3.9,4.5,0.2,0.2,0.2],["Danny Manning",4,2.6,0.7,0.5,0.5],["Darrell Armstrong",2.19,1.3,1.76,0.49,0.05],["DeSagana Diop",2.35,4.84,0.39,0.47,1.39],["Devean George",4.66,2.76,0.55,0.58,0.3],["Devin Harris",9.42,2.04,3.38,1.1,0.27],["Dirk Nowitzki",23.63,8.87,2.78,0.96,1.04],["Donnell Harvey",1.65,1.85,0.2,0.2,0.2],["Eddie Jones",3.7,2.8,1.5,0.6,0.2],["Eduardo Nájera",4.95,3.92,0.66,0.68,0.39],["Erick Dampier",6.63,7.62,0.79,0.3,1.29],["Erick Strickland",12.8,4.8,3.1,1.5,0.2],["Evan Eschmeyer",1.65,2.67,0.34,0.41,0.34],["Gary Trent",6.42,3.28,0.72,0.48,0.22],["Gerald Green",5.2,1.4,0.4,0.3,0.1],["Greg Buckner",5.18,3.22,1.06,0.72,0.25],["Howard Eisley",9,2.4,3.6,1.2,0.1],["Hubert Davis",7.36,1.86,1.56,0.42,0],["J.J. Barea",5.67,1.59,2.24,0.34,0.05],["James Singleton",5.1,4,0.3,0.4,0.5],["Jason Kidd",9.24,6.28,8.91,2.03,0.47],["Jason Terry",16.21,2.44,4.21,1.22,0.24],["Jerry Stackhouse",12.26,2.59,2.57,0.71,0.17],["Johnny Newman",4.2,1,0.3,0.6,0.1],["Josh Howard",15.56,6.25,1.72,1.13,0.6],["Josh Powell",3,2.2,0.2,0.2,0.1],["Juwan Howard",9.38,5.11,1.39,0.47,0.37],["Keith Van Horn",10.07,3.88,0.88,0.56,0.24],["Loy Vaught",3.1,3.3,0.4,0.4,0.1],["Malik Allen",3.1,2.7,0.6,0.2,0.4],["Marquis Daniels",9.29,3.29,2.34,1.14,0.2],["Matt Carroll",1.2,0.7,0.1,0.1,0],["Maurice Ager",1.95,0.59,0.23,0.07,0.1],["Michael Finley",19.89,5.22,3.67,1.13,0.39],["Nick Van Exel",12.69,2.88,4.27,0.57,0.1],["Popeye Jones",2,2.3,0.3,0.2,0],["Raef LaFrentz",9.72,5.53,0.88,0.61,1.55],["Raja Bell",3.1,1.9,0.8,0.7,0.1],["Rawle Marshall",3.1,1.3,0.4,0.3,0.3],["Robert Pack",8.9,1.4,5.8,1.1,0.1],["Ryan Hollins",2.9,2.3,0.1,0.1,0.6],["Scott Williams",3,2.2,0.4,0.2,0.3],["Sean Rooks",4.4,3.5,1,0.4,0.7],["Shawn Bradley",5.54,4.93,0.49,0.57,1.81],["Steve Nash",15.28,2.92,7.34,0.84,0.08],["Tim Hardaway",9.6,1.8,3.7,0.7,0.1],["Tony Delk",6,1.8,0.8,0.8,0.2],["Travis Best",2.8,1.1,1.8,0.5,0.1],["Trenton Hassell",2.1,1.2,0.7,0.2,0],["Walt Williams",5.5,3.1,0.9,0.6,0.4],["Wang Zhizhi",5.53,1.95,0.37,0.18,0.28]]],
    ["DAL","2010s",[["Al-Farouq Aminu",5.6,4.6,0.8,0.9,0.8],["Amar'e Stoudemire",10.8,3.7,0.3,0.4,0.2],["Andrew Bogut",3,8.4,1.9,0.5,1],["Bernard James",2.18,2.27,0.13,0.2,0.65],["Brandan Wright",8.32,4.01,0.47,0.49,1.19],["Brendan Haywood",5.35,5.88,0.44,0.29,1.18],["Brian Cardinal",1.9,0.97,0.57,0.31,0.06],["Caron Butler",15.1,4.73,1.7,1.39,0.3],["Chandler Parsons",14.74,4.8,2.59,0.9,0.3],["Charlie Villanueva",5.71,2.4,0.35,0.25,0.25],["Chris Kaman",10.5,5.6,0.8,0.4,0.8],["Courtney Lee",3.6,1.2,1,0.6,0],["Dahntay Jones",3.5,1.4,0.6,0.2,0.1],["Darren Collison",12,2.7,5.1,1.2,0.1],["David Lee",8.5,7,1.2,0.4,0.6],["DeAndre Jordan",11,13.7,2,0.7,1.1],["DeJuan Blair",6.4,4.7,0.9,0.8,0.3],["DeShawn Stevenson",4.47,1.4,0.95,0.27,0.08],["Delonte West",9.6,2.3,3.2,1.3,0.3],["Dennis Smith Jr.",14.47,3.55,4.91,1.1,0.3],["Deron Williams",13.72,2.79,6.22,0.79,0.16],["Devin Harris",7.59,1.92,2.45,0.77,0.17],["Dirk Nowitzki",18.25,6.29,2.07,0.65,0.63],["Dominique Jones",3.08,1.43,1.84,0.37,0.16],["Dorian Finney-Smith",5.9,3.73,1.02,0.72,0.33],["Doug McDermott",9,2.5,1.1,0.3,0.2],["Drew Gooden",8.9,6.9,0.6,0.6,1.1],["Dwight Powell",7.62,4.55,0.94,0.65,0.44],["Eduardo Nájera",3.3,2.3,0.4,0.5,0.4],["Elton Brand",7.2,6,1,0.7,1.3],["Erick Dampier",6,7.3,0.6,0.3,1.4],["Gal Mekel",2.4,0.9,2,0.1,0],["Greg Smith",1.9,1.9,0.2,0.2,0.3],["Harrison Barnes",18.73,5.22,1.64,0.7,0.2],["Ian Mahinmi",4.51,3.46,0.15,0.46,0.4],["J.J. Barea",9.61,2.16,4.38,0.43,0.02],["JaVale McGee",5.1,3.9,0.1,0.1,0.8],["Jae Crowder",4.63,2.28,0.93,0.77,0.24],["Jalen Brunson",9.3,2.3,3.2,0.5,0.1],["Jameer Nelson",7.3,2.7,4.1,0.7,0.1],["James Singleton",2.4,2.2,0.4,0.4,0.3],["Jason Kidd",8.43,4.79,7.92,1.74,0.35],["Jason Terry",15.88,2.01,3.85,1.16,0.2],["Jeremy Evans",2.4,1.8,0.1,0.2,0.3],["John Jenkins",3.3,1,0.4,0.1,0],["Josh Howard",12.5,3.6,1.4,0.7,0.3],["José Calderón",11.4,2.4,4.7,0.9,0.1],["Justin Anderson",5.1,2.64,0.55,0.4,0.4],["Justin Jackson",8.2,2.3,1,0.3,0],["Kris Humphries",5.2,3.8,0.3,0.3,0.4],["Kyle Collinsworth",3.2,3.3,1.8,0.5,0.3],["Lamar Odom",6.6,4.2,1.7,0.4,0.4],["Luka Dončić",21.2,7.8,6,1.1,0.3],["Matt Carroll",1.8,0.5,0.2,0.2,0],["Maxi Kleber",6.1,3.95,0.85,0.45,0.9],["Mike James",6.1,1.6,3.1,0.6,0.1],["Monta Ellis",18.95,3.01,4.91,1.8,0.3],["Nerlens Noel",6.13,6.11,0.78,1,0.87],["Nicolás Brussino",2.8,1.8,0.9,0.3,0.1],["O.J. Mayo",15.3,3.5,4.4,1.1,0.3],["Peja Stojaković",8.6,2.6,0.9,0.4,0.1],["Quinton Ross",2,1,0.3,0.3,0.1],["Rajon Rondo",9.3,4.5,6.5,1.2,0.1],["Raymond Felton",7.96,2.59,3.01,0.77,0.17],["Richard Jefferson",5.8,2.5,0.8,0.4,0.1],["Rodrigue Beaubois",7.06,1.86,2.07,0.68,0.28],["Ryan Broekhoff",4,1.5,0.5,0.1,0.1],["Salah Mejri",3.39,3.93,0.48,0.35,0.92],["Samuel Dalembert",6.6,6.8,0.5,0.5,1.2],["Seth Curry",12.8,2.6,2.7,1.1,0.1],["Shane Larkin",2.8,0.9,1.5,0.5,0],["Shawn Marion",11.55,6.97,1.75,1.04,0.64],["Trey Burke",9.7,1.5,2.6,0.5,0.1],["Tyson Chandler",10.2,10.46,0.75,0.55,1.15],["Vince Carter",11.95,3.69,2.45,0.86,0.44],["Wayne Ellington",3.2,1,0.4,0.4,0],["Wesley Matthews",12.93,3.08,2.45,1.04,0.24],["Yi Jianlian",2.6,1.6,0.2,0.2,0.3],["Yogi Ferrell",10.54,2.94,3.05,0.89,0.13],["Zaza Pachulia",8.6,9.4,1.7,0.8,0.3]]],
    ["DAL","2020s",[["JJ Redick",7.4,1.5,1.2,0.3,0.1],["JaVale McGee",4.4,2.5,0.3,0.1,0.6],["Kyrie Irving",25.8,5,5.1,1.2,0.6],["Brandon Knight",6.4,1.6,1.6,0.2,0],["Kemba Walker",8,1.8,2.1,0.2,0.2],["Klay Thompson",12.8,2.8,1.7,0.6,0.3],["Markieff Morris",3.1,1.8,0.8,0.2,0.1],["Davis Bertans",5.1,1.6,0.6,0.2,0.2],["Anthony Davis",24.7,11.6,3.5,1.2,2.2],["Khris Middleton",10.2,3.7,2.8,0.7,0.1],["Justin Holiday",4.5,1.2,0.9,0.4,0.4],["Reggie Bullock Jr.",7.9,3.5,1.3,0.6,0.2],["Tim Hardaway Jr.",14.9,3.4,1.9,0.6,0.2],["Trey Burke",5.8,0.9,1.4,0.4,0.1],["Spencer Dinwiddie",12.3,3.4,4.8,0.8,0.2],["Dwight Powell",5,3.8,1.1,0.5,0.4],["Dante Exum",8.2,2.2,2.8,0.5,0.2],["Kristaps Porziņģis",20.1,8.9,1.6,0.5,1.3],["Willie Cauley-Stein",5.3,4.5,0.7,0.4,0.8],["Christian Wood",16.6,7.3,1.8,0.4,1.1],["Josh Richardson",12.1,3.3,2.6,1,0.4],["Boban Marjanovic",4.5,2.8,0.2,0.1,0.2],["Marquese Chriss",4.5,3,0.5,0.4,0.4],["Dorian Finney-Smith",10.4,5.1,1.8,1,0.5],["Derrick Jones Jr.",8.6,3.3,1,0.7,0.7],["Frank Ntilikina",3.5,1.4,1.2,0.4,0.1],["Tyler Dorsey",3,0.7,0,0,0],["Sterling Brown",3.3,3,0.7,0.3,0.1],["Maxi Kleber",6.1,4.5,1.4,0.4,0.8],["Marvin Bagley III",10.5,6.1,1.4,0.5,0.7],["Jalen Brunson",14.4,3.6,4.2,0.7,0],["George King",0.3,1.3,0,0,0],["Caleb Martin",5.9,3.2,1.8,0.8,0.4],["P.J. Washington",13.9,6.8,2,1,1],["Luka Dončić",30.6,8.7,8.8,1.2,0.5],["Theo Pinson",2.5,1.4,1.1,0.2,0.1],["Moses Brown",5.8,3.4,0.2,0.5,0.3],["Daniel Gafford",10.9,7.1,1.4,0.7,1.7],["Nicolo Melli",3,2.7,1,0.3,0.1],["Tyrell Terry",1,0.5,0.5,0.5,0],["Josh Green",6.2,2.6,1.5,0.7,0.2],["Tyler Bey",1,1.1,0.2,0,0.1],["Nate Hinton",2,0.4,0.4,0.3,0.1],["Naji Marshall",14.2,4.8,3.1,1.1,0.2],["Facundo Campazzo",1.3,0.3,1.1,0.8,0],["Brandon Williams",8.2,1.8,2.4,0.6,0.2],["Jeremiah Robinson-Earl",4.6,4.7,0.7,0.4,0],["Greg Brown III",2.5,1.5,0.7,0,0.7],["Kai Jones",5,3.1,0.6,0.4,0.6],["Kessler Edwards",4.2,2.9,1.1,0.5,0.5],["Moses Wright",1.3,0.8,0.5,0,0.3],["McKinley Wright IV",4.2,1.7,2.1,0.3,0.2],["JaQuori McLaughlin",0,0,0.5,0,0],["Moussa Cisse",4.5,5.7,0.2,0.5,1.2],["A.J. Lawson",3.5,1.3,0.3,0.2,0.1],["Eugene Omoruyi",1.8,1.8,0.5,0,0],["Jaden Hardy",8.3,1.8,1.4,0.4,0.1],["Max Christie",10.9,3.2,1.9,0.7,0.4],["Dereck Lively II",7.3,6.6,1.8,0.6,1.5],["Olivier-Maxence Prosper",3.5,2.2,0.7,0.3,0.1],["Alex Fudge",2.5,0.8,0,0.5,0],["Jazian Gortman",1.5,0.3,0.4,0.1,0.1],["Tyler Smith",4.7,2.8,0.4,0.5,0],["Dexter Dennis",5.5,2.3,1,0,0.3],["AJ Johnson",3.3,1.1,1,0.2,0.1],["Cooper Flagg",21,6.7,4.5,1.2,0.9],["Miles Kelly",3.1,1.7,0.9,0.3,0.1],["Ryan Nembhard",6.6,2.2,5.3,0.4,0],["John Poulakidas",8.8,2.3,0.8,0.5,0.3]]],
    ["DEN","1970s",[["Anthony Roberts",8.8,4.21,1.47,0.41,0.06],["Bo Ellis",3.74,3.06,0.66,0.46,0.5],["Bob Wilkerson",11.4,5.55,4.51,1.55,0.3],["Bobby Jones",14.81,8.4,3.3,2.06,1.86],["Brian Taylor",11.6,2.5,3.4,1.8,0.2],["Byron Beck",4.7,1.8,0.6,0.3,0],["Charlie Scott",12,2.7,5.4,1,0.4],["Chuck Williams",4.8,1.6,2.1,0.4,0],["Dan Issel",20.19,9.34,3.01,1.07,0.5],["Darnell Hillman",7.8,7.2,1.6,0.4,1.1],["David Thompson",25.73,4.21,3.88,1.17,0.96],["Fatty Taylor",3.8,2.7,3.6,1.7,0.1],["Geoff Crompton",1.3,1.2,0.3,0,0.2],["George McGinnis",22.6,11.4,3.7,1.7,0.7],["Gus Gerard",10,4.2,2,0.9,1.3],["Jim Price",7.38,3.25,3.52,1.56,0.21],["John Kuester",1.4,0.4,1.1,0.5,0],["Kim Hughes",2.6,4.1,0.9,0.7,1.3],["Mack Calvin",7.47,1.26,2.47,0.68,0.07],["Marvin Webster",6.7,6.1,0.8,0.3,1.5],["Monte Towe",2.5,0.7,1.7,0.3,0],["Paul Silas",7.2,7.5,1.6,0.7,0.3],["Phil Hicks",2,1.4,0.4,0.3,0],["Ralph Simpson",5.5,2.3,2.3,1.3,0.1],["Robert Smith",5.09,1.45,1.93,0.59,0.16],["Ted McClain",8.2,3.2,4.5,1.5,0.2],["Tom Boswell",10.6,6.8,3.1,0.6,0.6],["Tom LaGarde",4,2.8,0.6,0.2,0.2],["Willie Wise",8.2,3.4,1.9,0.8,0.2]]],
    ["DEN","1980s",[["Alex English",26.69,5.83,4.56,1.06,0.8],["Anthony Roberts",6.16,3.8,0.81,0.46,0.1],["Bill Hanzlik",7.89,2.8,3.09,1.01,0.24],["Billy McKinney",10.43,1.9,4.18,0.87,0.14],["Blair Rasmussen",8.8,4.61,0.72,0.29,0.67],["Bo Ellis",3.4,2.4,0.6,0.2,0.5],["Bob Wilkerson",13.8,4.2,3.2,1.2,0.4],["Calvin Natt",17.85,6.3,2.45,0.81,0.26],["Carl Nicks",6.1,1.8,3,1,0.1],["Cedrick Hordges",7.55,5.85,1.13,0.39,0.25],["Charlie Scott",9.3,2.4,3.6,0.7,0.3],["Dan Issel",20.54,7.26,2.25,0.92,0.6],["Danny Schayes",9.27,5.7,1.13,0.51,0.87],["Darrell Walker",12.2,4,3.5,1.5,0.5],["Darwin Cook",5.4,1.6,1.4,0.9,0.2],["Dave Greenwood",5.9,5.7,1.4,0.6,1],["Dave Robisch",7.43,3.96,1.41,0.27,0.25],["David Thompson",20.97,3.43,2.66,0.73,0.74],["Eddie Hughes",2.7,0.7,1.3,0.7,0.1],["Elston Turner",4.83,3.07,2.03,1.14,0.1],["Fat Lever",16.79,7.31,7.74,2.54,0.32],["Gary Garland",4.3,1.8,1.9,0.7,0.1],["George Johnson",10.2,7.8,2.1,1.1,0.9],["George McGinnis",15.6,10.3,4.9,1.5,0.4],["Glen Gondrezick",6.34,4.49,1.44,1.17,0.3],["Howard Carter",6.2,1.6,1.3,0.3,0.1],["James Ray",3.23,2.21,0.77,0.37,0.37],["Jay Vincent",14.82,4.16,1.94,0.57,0.39],["Jerome Lane",4.8,3.7,1.1,0.4,0.1],["Joe Kopicki",3.5,2,0.7,0.3,0],["John Roche",9.21,1.19,4.3,0.79,0.14],["Kenny Dennard",2.1,2.3,1,0.5,0.2],["Kenny Higgs",7.65,1.95,5.44,1.14,0.1],["Kiki Vandeweghe",23.32,5.25,2.68,0.68,0.5],["Kim Hughes",3.08,4.86,1.13,0.95,1.17],["Mark Alarie",7.9,3.3,1.2,0.3,0.4],["Maurice Martin",2.95,0.96,0.69,0.26,0.1],["Michael Adams",16.13,3.18,6.25,2.1,0.15],["Mike Evans",8.7,1.43,2.58,0.78,0.08],["Otis Smith",4.02,1.48,0.77,0.1,0.14],["Pete Williams",2.59,2.58,0.29,0.37,0.37],["Rich Kelley",4.6,4.5,1.6,0.6,0.5],["Richard Anderson",8.5,5.2,2.5,0.6,0.4],["Rob Williams",8.65,2.16,5.42,1.15,0.15],["T.R. Dunn",5.25,5.1,1.92,1.55,0.29],["Walter Davis",15.6,1.9,2.3,0.9,0.1],["Wayne Cooper",9.55,7.42,0.98,0.39,2.39],["Willie White",3.67,0.95,0.96,0.26,0.05]]],
    ["DEN","1990s",[["Alex English",17.9,3.6,2.8,0.6,0.3],["Anthony Cook",4.26,4.47,0.32,0.49,0.92],["Anthony Goldwire",8.73,1.78,3.7,0.88,0.08],["Antonio McDyess",17.16,8.23,1.3,0.94,1.77],["Avery Johnson",3.8,1,3.7,0.7,0.1],["Bill Hanzlik",6.2,2.6,2.3,1,0.4],["Bison Dele",7.96,5.2,0.69,0.6,0.92],["Blair Rasmussen",12.45,8.41,1,0.59,1.58],["Bobby Jackson",11.6,4.4,4.7,1.5,0.2],["Brooks Thompson",6.8,1.5,2.8,0.8,0],["Bryant Stith",11.45,3.72,2.2,1.1,0.23],["Carl Herrera",2.5,2.3,0,0.5,0.3],["Chauncey Billups",13.9,2.1,3.8,1.3,0.3],["Cliff Levingston",2.3,2.2,0.5,0.2,0.4],["Cory Alexander",9.91,2.96,4.35,1.39,0.18],["Dale Ellis",14.28,3.4,1.47,0.63,0.1],["Danny Fortson",10.51,7.91,0.85,0.6,0.4],["Danny Schayes",10.4,6.5,1.2,0.8,0.8],["Darnell Mee",1.88,0.88,0.43,0.41,0.29],["Darvin Ham",2.3,1.6,0.4,0.2,0.2],["Dean Garrett",7.3,7.9,1.1,0.7,1.6],["Dikembe Mutombo",12.92,12.29,1.67,0.56,3.81],["Don MacLean",11.2,3.7,1.6,0.4,0.1],["Doug Overton",3.3,1.1,1.9,0.2,0.1],["Eddie Hughes",3.5,1.2,1.9,0.8,0],["Eric Washington",6.86,2.05,1.05,0.76,0.44],["Eric Williams",8.49,2.4,1.19,0.73,0.18],["Ervin Johnson",7.1,11.1,0.9,0.8,2.8],["Fat Lever",18.3,9.3,6.5,2.1,0.2],["Gary Plummer",4.7,2.9,0.7,0.2,0.2],["George Zídek",3.22,1.62,0.27,0.07,0.08],["Greg Anderson",9.4,9.6,0.77,0.93,0.83],["Greg Grant",1.87,0.64,2.39,0.32,0.06],["Harold Ellis",6.1,1.9,0.7,0.7,0.1],["Jalen Rose",9.09,3,5.5,0.75,0.4],["Jerome Allen",2.6,1.3,1.7,0.2,0.2],["Jerome Lane",6,7.12,1.77,0.76,0.24],["Jim Farmer",8.76,2.22,1.43,0.43,0.09],["Joe Barry Carroll",11.9,6.4,1.8,0.9,2],["Joe Wolf",4.45,3.87,0.97,0.58,0.25],["Johnny Newman",14.7,1.9,1.9,1,0.3],["Johnny Taylor",5.8,2.8,0.7,0.8,0.5],["Kenny Battle",6.1,3.1,1.2,1,0.3],["Kenny Smith",7.9,1.1,3.1,0.5,0],["Keon Clark",3.3,3.4,0.4,0.4,1.1],["Kevin Brooks",3.29,1.14,0.38,0.15,0.06],["Kiwane Lemorris Garris",2.4,0.7,1,0.3,0],["LaPhonso Ellis",15.19,7.87,2.14,0.84,0.92],["Mahmoud Abdul-Rauf",16.03,2.06,3.99,0.91,0.08],["Marcus Liberty",7.96,3.74,0.97,0.76,0.33],["Mark Jackson",10.4,5.2,12.3,1,0.2],["Mark Macon",9.17,2.51,2.31,1.72,0.16],["Mark Randall",1.81,0.96,0.33,0.23,0.08],["Michael Adams",20.51,3.3,8.21,1.82,0.05],["Nick Van Exel",16.5,2.3,7.4,0.8,0.1],["Orlando Woolridge",25.1,6.8,2.2,1.3,0.4],["Priest Lauderdale",3.7,2.6,0.5,0.2,0.4],["Reggie Slater",4.62,2.23,0.5,0.3,0.13],["Reggie Williams",14.16,4.57,2.91,1.49,0.78],["Ricky Pierce",10.2,1.6,0.9,0.4,0.2],["Robert Pack",10.54,2.16,5.32,1.23,0.1],["Robert Werdann",1.9,1.9,0.3,0.2,0.1],["Rodney Rogers",10.16,3.86,1.65,1,0.6],["Scott Hastings",1.89,2.04,0.5,0.23,0.2],["T.R. Dunn",2.07,2.18,0.85,0.62,0.1],["Tim Kempton",5.4,3.1,1.7,0.4,0.1],["Todd Lichti",8.12,2.14,1.42,0.76,0.21],["Tom Hammonds",5.34,3.45,0.53,0.28,0.22],["Tony Battie",8.4,5.4,0.9,0.8,1.1],["Walter Davis",15.53,2.42,1.99,0.99,0.07],["Winston Garland",10.8,2.4,5.3,1.3,0.3]]],
    ["DEN","2000s",[["Allen Iverson",25.64,2.99,7.13,1.9,0.14],["Andre Miller",13.94,4.32,7.24,1.51,0.2],["Anthony Carter",6.44,2.73,5.08,1.32,0.3],["Anthony Goldwire",4.1,0.6,1.7,0.5,0],["Antonio McDyess",19.35,9.88,2.03,0.78,1.56],["Avery Johnson",9.4,1.3,5.1,0.7,0.2],["Bobby Jones",3.4,1.5,0.4,0.2,0],["Bryant Stith",5.6,1.9,1.4,0.4,0.3],["Bryon Russell",4.34,2.48,1,0.59,0.2],["Calbert Cheaney",6.72,3.35,1.53,0.49,0.29],["Carlos Arroyo",4.1,1.4,2.5,0.3,0.1],["Carmelo Anthony",24.19,6.13,3.09,1.13,0.45],["Chauncey Billups",16.56,2.94,5.91,1.14,0.2],["Chris Andersen",4.78,4.83,0.45,0.51,1.68],["Chris Gatling",10.4,5.1,0.8,0.9,0.3],["Chris Herren",3.1,1.2,2.5,0.3,0],["Chris Whitney",9.6,1.6,4.3,0.6,0],["Chucky Atkins",3.67,0.97,2,0.29,0.04],["Cory Alexander",2.8,1.4,2,0.8,0.1],["Dahntay Jones",5.4,2.1,1,0.6,0.2],["DerMarr Johnson",5.92,1.82,0.87,0.48,0.33],["Donnell Harvey",7.93,5.55,1.25,0.6,0.48],["Earl Boykins",12.08,1.67,4.02,0.8,0.07],["Earl Watson",7.5,1.9,3.5,0.8,0.2],["Eduardo Nájera",6.09,4.5,0.99,0.9,0.44],["Francisco Elson",4.07,3.7,0.57,0.64,0.6],["George McCloud",9.53,3.4,3.31,0.7,0.33],["Greg Buckner",6.46,2.95,1.8,1.15,0.2],["J.R. Smith",13.58,2.75,2.02,0.87,0.17],["Jamal Sampson",1.1,2.2,0.2,0.1,0.3],["James Posey",9.43,5.08,2.18,1.28,0.44],["Johan Petro",2.2,2.3,0.4,0.1,0.4],["Jon Barry",6.2,2.2,2.6,1,0.1],["Junior Harrington",5.1,3,3.4,1,0.2],["Juwan Howard",17.78,7.5,2.86,0.88,0.45],["Kenny Satterfield",5.41,1.48,2.77,0.86,0.04],["Kenyon Martin",13.13,6.57,1.78,1.23,1.08],["Keon Clark",7.97,5.93,0.93,0.57,1.37],["Kevin Willis",9.6,7.2,0.7,0.9,0.7],["Linas Kleiza",8.31,3.47,0.73,0.41,0.2],["Marcus Camby",10.05,11.07,2.5,1.12,3.03],["Mark Blount",5.2,3.4,0.6,0.4,0.9],["Mark Strickland",4.4,2.6,0.4,0.3,0.4],["Mengke Bateer",5.1,3.6,0.8,0.4,0.2],["Michael Doleac",3.6,2.9,0.5,0.2,0.2],["Nenê",11.53,6.62,1.63,1.24,0.88],["Nick Van Exel",17.91,3.69,8.61,0.85,0.2],["Nikoloz Tskitishvili",3.19,1.89,0.74,0.33,0.33],["Popeye Jones",2.6,2.6,0.5,0.1,0.2],["Raef LaFrentz",13.19,7.74,1.27,0.52,2.54],["Reggie Evans",4.98,7.48,0.67,0.6,0.2],["Renaldo Balkman",5,3.8,0.6,0.9,0.4],["Robert Pack",6.5,1.9,4,0.9,0],["Rodney White",7.65,2.46,1.17,0.55,0.32],["Ron Mercer",18.3,4.1,2.8,0.9,0.4],["Roy Rogers",2.2,2,0.2,0.1,1],["Ruben Patterson",13.2,3.5,2.6,1.3,0.3],["Ryan Bowen",3.23,2.59,0.58,0.77,0.37],["Scott Williams",4.9,5.1,0.3,0.4,0.8],["Shammond Williams",9.4,2.3,5.1,0.6,0.1],["Shawnelle Scott",3.9,4.9,0.4,0.1,0.3],["Steve Blake",8.3,2.5,6.6,1,0.1],["Tariq Abdul-Wahad",5.93,2.95,1.1,0.6,0.52],["Vincent Yarbrough",6.9,2.7,2.2,1,0.6],["Von Wafer",1.3,0.5,0.2,0.1,0],["Voshon Lenard",12.38,2.71,2.08,0.79,0.26],["Wesley Person",8.1,2.4,1.1,0.5,0.2],["Yakhouba Diawara",3.67,1.43,0.81,0.32,0.1],["Zendon Hamilton",6,4.7,0.3,0.4,0.3]]],
    ["DEN","2010s",[["Aaron Brooks",11.9,2.7,5.2,0.9,0.2],["Al Harrington",12.23,5.25,1.4,0.69,0.15],["Alonzo Gee",3.88,1.65,0.5,0.62,0.18],["Andre Iguodala",13,5.3,5.4,1.7,0.7],["Andre Miller",9.01,2.96,5.76,0.87,0.12],["Anthony Carter",3.01,1.46,2.77,0.68,0.18],["Anthony Randolph",4.28,2.61,0.51,0.55,0.45],["Arron Afflalo",12.41,3.31,2.08,0.57,0.29],["Axel Toupane",3.6,1.5,0.7,0.3,0.3],["Carmelo Anthony",26.94,7.02,3.03,1.13,0.48],["Chauncey Billups",18.27,2.85,5.48,1.06,0.14],["Chris Andersen",5.69,5.58,0.36,0.57,1.62],["Corey Brewer",10.76,2.73,1.5,1.32,0.3],["D.J. Augustin",11.6,1.9,4.7,0.9,0.1],["Danilo Gallinari",16.16,4.86,2.19,0.81,0.39],["Darrell Arthur",6.35,3.12,1.05,0.67,0.56],["Devin Harris",8.2,1.6,2.5,0.5,0.1],["Emmanuel Mudiay",11.11,3.03,4.3,0.77,0.3],["Erick Green",3.18,0.67,0.86,0.28,0],["Evan Fournier",7.37,2.1,1.4,0.43,0.07],["Gary Forbes",5.2,1.8,0.8,0.4,0.1],["Gary Harris",12.43,2.55,2.11,1.23,0.18],["J.J. Hickson",9.3,7.26,1.06,0.59,0.6],["J.R. Smith",13.81,3.61,2.3,1.25,0.25],["JaKarr Sampson",5.2,2.3,0.6,0.5,0.7],["JaVale McGee",8.66,4.63,0.28,0.37,1.78],["Jamal Murray",14.83,3.48,3.39,0.83,0.33],["Jameer Nelson",8.9,2.52,4.73,0.67,0.1],["Jan Veselý",4.4,3.7,0.5,1.3,0.8],["Joey Graham",4.2,2,0.3,0.4,0.1],["Joffrey Lauvergne",6.74,4.41,0.78,0.23,0.33],["Johan Petro",3.4,3.6,0.4,0.3,0.4],["Jordan Hamilton",5.6,2.77,0.76,0.5,0.21],["Juancho Hernangómez",5.05,3.23,0.63,0.41,0.23],["Julyan Stone",1.63,1.05,1.52,0.38,0.25],["Jusuf Nurkić",7.56,5.91,1.08,0.74,1.07],["Kenneth Faried",11.43,8.27,1.04,0.76,0.85],["Kenyon Martin",10.19,7.95,2.08,1.06,0.92],["Kosta Koufos",6.9,6.08,0.33,0.48,1.1],["Kostas Papanikolaou",2.6,1.5,0.6,0.5,0.2],["Malik Allen",2.1,1.6,0.3,0.2,0.1],["Malik Beasley",7.26,1.75,0.84,0.46,0.09],["Mason Plumlee",7.71,6,2.5,0.74,1.01],["Melvin Ely",2.3,2.5,0.5,0.1,0.4],["Mike Miller",1.33,1.34,0.96,0.24,0.07],["Monte Morris",10.15,2.34,3.55,0.9,0],["Nate Robinson",8.43,1.54,2.41,0.63,0.1],["Nenê",14.02,7.57,2.25,1.26,0.98],["Nikola Jokić",16.28,9.55,5.17,1.11,0.72],["Paul Millsap",13.3,6.92,2.28,1.13,0.94],["Quincy Miller",4.47,2.5,0.49,0.36,0.53],["Randy Foye",9.88,2.28,2.79,0.69,0.36],["Raymond Felton",11.5,3.6,6.5,1.3,0],["Richard Jefferson",1.5,0.9,0.8,0.1,0.1],["Rudy Fernández",8.6,2.1,2.4,1,0.1],["Shelden Williams",4.7,5.3,0.5,0.4,0.5],["Timofey Mozgov",6.76,5.17,0.53,0.27,0.95],["Torrey Craig",5.19,3.43,0.86,0.43,0.53],["Trey Lyles",9.25,4.33,1.29,0.45,0.45],["Ty Lawson",14.25,2.89,6.61,1.21,0.1],["Will Barton",13.87,4.98,3.13,0.86,0.53],["Wilson Chandler",13.11,5.58,1.81,0.72,0.48]]],
    ["DEN","2020s",[["Paul Millsap",9,4.7,1.8,0.9,0.6],["Jeff Green",9.1,2.9,1.2,0.3,0.3],["Russell Westbrook",13.3,4.9,6.1,1.4,0.5],["JaVale McGee",7.3,5.2,0.8,0.4,1.2],["DeAndre Jordan",4.2,4.9,0.8,0.3,0.5],["DeMarcus Cousins",9,5.6,1.5,0.7,0.4],["Ish Smith",2.5,1.3,2.3,0.2,0.2],["Jonas Valančiūnas",8.7,5.1,1.2,0.2,0.6],["Reggie Jackson",10.2,2,3.6,0.6,0.1],["Austin Rivers",7,2,1.8,0.8,0.1],["Will Barton",13.7,4.4,3.5,0.9,0.4],["Justin Holiday",4,1.2,1.2,0.6,0.2],["JaMychal Green",7.2,4.5,0.9,0.5,0.4],["Kentavious Caldwell-Pope",10.4,2.5,2.4,1.4,0.6],["Tim Hardaway Jr.",13.5,2.6,1.4,0.5,0.1],["James Ennis III",4.1,1.7,0.4,0.3,0.3],["Aaron Gordon",14.8,5.9,3,0.7,0.5],["Dario Saric",3.5,3.1,1.4,0.4,0.1],["Nikola Jokić",26.9,12.4,9.3,1.4,0.8],["Greg Whittington",0,0,0,0,0],["Tyus Jones",3,1.1,2.4,0.6,0],["Jamal Murray",21.8,4.1,6.1,1.1,0.4],["Petr Cornelie",1.1,1.1,0.2,0.1,0.1],["Bryn Forbes",8.8,1.2,1,0.3,0.1],["Shaquille Harrison",2.1,1.4,0.7,0.5,0.1],["PJ Dozier",6.6,3.5,1.7,0.6,0.3],["Thomas Bryant",9.8,5.7,0.5,0.3,0.5],["Monte Morris",11.4,2.5,3.8,0.7,0.2],["Vlatko Čančar",3.2,2,0.9,0.2,0.2],["Davon Reed",3.2,1.8,0.8,0.4,0.2],["Bruce Brown",9.7,4,2.8,1.1,0.4],["Michael Porter Jr.",16.2,6.7,1.5,0.7,0.6],["Jalen Pickett",3.6,1.4,1.8,0.3,0.1],["Bol Bol",2.2,0.8,0.2,0.1,0.3],["Cameron Johnson",12.2,3.8,2.4,0.7,0.4],["Zeke Nnaji",4.2,2.4,0.4,0.3,0.5],["Markus Howard",3.4,0.5,0.3,0.2,0],["Facundo Campazzo",5.6,2,3.5,1.1,0.3],["Braxton Key",1.1,0.9,0.5,0.1,0.1],["Bones Hyland",10.1,2.7,2.8,0.6,0.3],["Carlik Jones",0.8,0.6,1,0.2,0],["Jay Huff",1.2,0.6,0.1,0.1,0.2],["Julian Strawther",6.9,1.8,1.1,0.4,0.1],["Christian Braun",9.8,4,1.9,0.7,0.3],["Peyton Watson",8.2,3.3,1.3,0.6,1],["Collin Gillespie",3.6,0.9,1.1,0.5,0],["David Roddy",8,4,0.8,0.8,0.2],["Jack White",1.2,1,0.2,0.2,0.1],["Trey Alexander",1.3,0.5,0.5,0.1,0],["DaRon Holmes II",3.7,1.4,0.6,0,0.2],["PJ Hall",1.7,1.2,0.2,0,0.2],["Hunter Tyson",2,1.2,0.4,0.1,0],["KJ Simpson",4.6,1.9,2.2,0.8,0],["Spencer Jones",3.4,2.1,0.6,0.6,0.4],["Curtis Jones",2.9,1.1,1,0.4,0]]],
    ["DET","1960s",[["Archie Dees",8.45,4.85,0.6,null,null],["Bailey Howell",21.14,11.83,2.27,null,null],["Bill Buntin",7.7,6,0.9,null,null],["Billy Kenville",5.1,2.8,1.8,null,null],["Bob Duffy",4.96,1.27,1.76,null,null],["Bob Ferry",12.38,6.31,1.73,null,null],["Chico Vaughn",5.69,1.47,2.05,null,null],["Chuck Noble",7.55,2.69,3.86,null,null],["Darrall Imhoff",3.88,4.24,0.83,null,null],["Dave Bing",23.49,4.73,5.85,null,null],["Dave DeBusschere",16.1,11.25,2.62,null,null],["Dave Gambee",6.8,3.1,0.6,null,null],["Dick McGuire",7.1,3.9,5.3,null,null],["Don Kojis",6.88,3.99,0.86,null,null],["Don Ohl",16.72,3.06,3.49,null,null],["Donnie Butcher",7.01,3.56,2.37,null,null],["Dorie Murrey",2.8,2.9,0.3,null,null],["Earl Lloyd",8.9,4.7,1.3,null,null],["Ed Conlin",11.2,4.9,1.8,null,null],["Eddie Miles",15.07,3.32,2.25,null,null],["Gary Alcorn",4,4.8,0.4,null,null],["Gene Shue",21.43,4.82,5.52,null,null],["George Lee",9.83,5.64,1.05,null,null],["George Patterson",2,2.7,0.9,null,null],["Happy Hairston",18.27,11.39,1.32,null,null],["Howard Komives",12.9,3.8,5,null,null],["Hub Reed",3.4,3.3,0.6,null,null],["Jackie Moreland",7.7,5.13,1.26,null,null],["Jim Fox",4.56,5.6,0.8,null,null],["Jimmy Walker",10.13,1.98,2.98,null,null],["Joe Caldwell",10.63,6.4,1.87,null,null],["Joe Strawder",8.56,9.95,1.06,null,null],["John Barnhill",7.5,2.5,2.5,null,null],["John Tresvant",10.57,7.71,1.56,null,null],["Johnny Egan",6.69,1.63,2.61,null,null],["Kevin Loughery",6.32,1.87,1.77,null,null],["Larry Staverman",5.7,3.5,0.6,null,null],["Len Chappell",10,6.1,0.8,null,null],["McCoy McLemore",7.3,4.7,0.9,null,null],["Otto Moore",7.7,7.1,0.9,null,null],["Ray Scott",16,10.72,2.69,null,null],["Reggie Harding",9.28,9.24,1.71,null,null],["Rod Thorn",11.78,3.63,2.25,null,null],["Ron Reed",8.02,6.37,1.44,null,null],["Shellie McMillon",9.14,5.84,0.96,null,null],["Sonny Dove",3.07,2,0.4,null,null],["Terry Dischinger",13.47,5.52,1.75,null,null],["Tom Van Arsdale",10.21,3.74,2.28,null,null],["Walt Bellamy",18.8,13.5,1.9,null,null],["Walter Dukes",10.24,11.06,1.43,null,null],["Wayne Hightower",8.6,5.7,1,null,null],["Willie Jones",7.42,2.82,2.01,null,null]]],
    ["DET","1970s",[["Al Eberhard",6.74,3.47,0.78,0.75,0.15],["Al Skinner",7,2.5,1.6,0.8,0.2],["Andre Wakefield",2.4,1.1,1,0.3,0],["Archie Clark",7.6,1.7,2.8,0.8,0.1],["Ben Kelso",1.8,0.7,0.4,0.3,0],["Ben Poquette",5.81,3.75,0.64,0.38,0.93],["Bill Hewitt",5.66,5.89,1.3,null,null],["Bill Ligon",3.3,0.7,0.7,0.2,0.2],["Bob Lanier",22.8,11.94,3.3,1.16,1.99],["Bob Nash",2.09,1.49,0.4,0.1,0.3],["Bob Quick",7.47,3.68,0.84,null,null],["Chris Ford",8.49,3.48,3.49,1.91,0.26],["Curtis Rowe",13.28,7.99,1.76,0.6,0.5],["Dave Bing",22.08,3.89,6.72,1.4,0.25],["Don Adams",8.79,5.72,1.69,1.46,0.28],["Earl Tatum",7.8,1.6,0.9,1,0.4],["Earl Williams",3.7,5.5,0.4,0.5,0.4],["Eddie Miles",13.5,3.9,1.9,null,null],["Eric Money",11.92,2.14,3.5,1.28,0.13],["Erwin Mueller",6.76,4.51,2.01,null,null],["Fred Foster",8.7,2.9,1.5,null,null],["George Trapp",8.64,3.4,0.83,0.49,0.3],["Gus Gerard",7.64,2.99,0.86,0.71,0.48],["Harvey Marlatt",3.67,1.4,1.52,null,null],["Howard Komives",9.37,2.17,3.57,null,null],["Howard Porter",10.73,4.89,0.47,0.5,0.68],["Isaiah Wilson",3.5,1,0.9,null,null],["Jim Brewer",2.3,4.2,0.5,0.5,0.4],["Jim Davis",4.59,3.69,0.95,0.55,0.45],["Jim Price",11.5,3,3,1.3,0.1],["Jimmy Walker",19.9,2.87,3.49,null,null],["John Long",16.1,3.2,1.5,1.2,0.2],["John Mengelt",10.23,2.32,2,0.81,0.1],["John Shumate",15.5,8.9,2,1.2,0.7],["Kevin Porter",11.89,1.9,10.1,1.49,0.11],["Leon Douglas",9.9,7.42,1.03,0.57,0.77],["Lindsay Hairston",5.8,3.8,0.4,0.4,0.7],["M.L. Carr",14.8,7.4,2.6,2.13,0.54],["Marvin Barnes",9.67,5.32,0.95,0.68,0.66],["McCoy McLemore",8,4.6,1.1,null,null],["Otto Moore",10.33,9.69,1.19,0,0.5],["Paul Long",3.3,0.4,0.7,null,null],["Phil Sellers",4.5,0.9,0.6,0.5,0],["Ralph Simpson",10.88,2.46,2.42,0.93,0.1],["Rickey Green",6.6,1.5,2.3,0.9,0],["Roger Brown",1.84,3.07,0.34,0.26,0.6],["Steve Mix",7.31,4.14,0.88,null,null],["Steve Sheppard",1.6,1,0.2,0.2,0.1],["Stu Lantz",9.25,2.86,2.3,0.8,0.1],["Terry Dischinger",10.8,4.77,1.42,null,null],["Terry Driscoll",5.4,5.8,0.8,null,null],["Terry Tyler",12.9,7.9,1.1,1.3,2.5],["Walt Bellamy",10,7.1,1,null,null],["Willie Norwood",7.67,3.75,0.71,0.84,0.09]]],
    ["DET","1980s",[["Adrian Dantley",20.28,3.77,2.22,0.66,0.1],["Alan Hardy",3.7,0.9,0.5,0.2,0.1],["Bill Laimbeer",15.25,11.57,2.14,0.71,1.02],["Bob Lanier",21.7,10.1,3.3,1,1.6],["Bob McAdoo",20.25,7.98,3.39,1.3,1.11],["Brook Steppe",4.7,1.1,0.7,0.3,0.1],["Chuck Nevitt",1.63,1.51,0.11,0.15,0.62],["Cliff Levingston",6.56,5.45,1.14,0.51,0.83],["Dan Roundfield",10.9,8.1,1.8,0.5,1],["David Thirdkill",1.91,0.72,0.51,0.22,0.12],["Dennis Rodman",9.09,7.53,1.07,0.7,0.67],["Earl Cureton",5.86,5.17,1.08,0.58,0.54],["Earl Evans",4.4,2.1,1,0.4,0],["Edgar Jones",8.05,4.91,1.1,0.6,1.75],["Eric Money",10.9,1.8,4.3,1,0.2],["Fennis Dembo",1.2,0.7,0.2,0,0],["Greg Kelser",12.96,5.04,1.94,1.17,0.83],["Isiah Thomas",20.25,3.73,9.79,2.11,0.29],["James Edwards",6.82,3,0.5,0.1,0.35],["Jeff Judkins",2.6,1.1,0.5,0.2,0.2],["Jim McElroy",11.7,1.4,4.5,0.7,0.4],["Joe Dumars",12.99,2.11,4.9,0.98,0.13],["John Long",15.18,3.11,1.99,1.07,0.27],["John Salley",6.93,4.47,1.06,0.56,1.45],["Keith Herron",13.7,2.6,1.9,1.1,0.3],["Kelly Tripucka",21.58,4.49,3.24,1.04,0.21],["Kenny Carr",7.4,4.9,0.8,0.2,0.2],["Kent Benson",9.55,6.13,1.84,0.89,0.86],["Kurt Nimphius",3.4,1.9,0.3,0.1,0.5],["Larry Drew",6.6,1.6,3.3,1.2,0.1],["Larry Wright",7.24,1.96,3.33,0.88,0.2],["Leon Douglas",8.1,7.2,1.7,0.4,0.9],["Lionel Hollins",1.8,0.7,1.9,0.4,0],["Major Jones",2.7,2.7,0.3,0.2,0.3],["Mark Aguirre",15.5,4.2,2.5,0.4,0.2],["Micheal Williams",2.6,0.6,1.4,0.3,0.1],["Mike Gibson",1.5,1.3,0.2,0.3,0.1],["Paul Mokeski",5.82,4.51,1.34,0.43,0.8],["Phil Hubbard",11.54,5.99,1.48,0.86,0.27],["Ralph Lewis",1.7,1,0.3,0.3,0.1],["Ray Tolbert",3.83,2.47,0.57,0.27,0.55],["Rick Mahorn",7.16,6.57,0.78,0.55,0.78],["Ricky Pierce",2.2,0.9,0.4,0.2,0.1],["Ron Lee",4.36,2.4,4.38,1.86,0.32],["Roy Hamilton",4.6,1.5,2.7,0.7,0.1],["Sidney Green",7.9,8.2,0.8,0.5,0.6],["Steve Hayes",4.5,3.8,0.9,0.1,0.7],["Terry Duerod",9.3,1.5,1.7,0.6,0.2],["Terry Tyler",11.35,5.97,1.4,1.05,1.78],["Tom Owens",4.2,3.8,0.9,0.2,0.3],["Tony Campbell",6.19,2.18,0.47,0.59,0.08],["Vinnie Johnson",13.22,3.08,3.38,0.88,0.27],["Walker Russell",2.62,1.09,1.79,0.21,0],["Wayne Robinson",7.9,3.6,1.4,0.6,0.3],["William Bedford",2.7,1.7,0.1,0.2,0.4]]],
    ["DET","1990s",[["Aaron McKie",5.65,2.93,1.73,1,0.13],["Allan Houston",14.3,2.49,2.18,0.63,0.2],["Alvin Robertson",9.3,4.4,3.6,2.2,0.3],["Bill Curley",2.7,2.3,0.5,0.4,0.4],["Bill Laimbeer",10.37,7.32,1.88,0.6,0.72],["Bison Dele",14,7.63,1.28,0.86,0.74],["Bob McCann",1.2,1.2,0.2,0.2,0.2],["Brad Sellers",2.4,1,0.3,0,0.2],["Charles Jones",2.2,5.6,0.7,0.3,1],["Charles O'Bannon",2.48,1.4,0.64,0.22,0.08],["Charles Thomas",1.3,0.6,0.6,0.1,0],["Danny Young",2.9,0.7,1.8,0.5,0.1],["Darrell Walker",4.73,3.08,2.6,0.92,0.18],["Dave Greenwood",1.6,2.1,0.3,0.1,0.2],["David Wood",4.1,3.1,0.7,0.5,0.2],["Dennis Rodman",8.64,14.57,1.44,0.75,0.75],["Don Reid",3.77,2.79,0.38,0.51,0.66],["Eric Leckner",3.54,2.81,0.18,0.25,0.28],["Eric Montross",2.25,3.3,0.22,0.26,0.56],["Gerald Glass",5.3,2.5,1.2,0.5,0.3],["Gerald Henderson",3.27,0.98,1.65,0.31,0.03],["Grant Hill",20.73,8.12,6.47,1.66,0.67],["Grant Long",4.43,3.55,0.6,0.7,0.18],["Greg Anderson",6.4,7.4,0.7,0.7,0.9],["Isiah Thomas",17.32,3.2,8.26,1.53,0.18],["Ivano Newbill",1.2,2.4,0.5,0.4,0.3],["James Edwards",14.08,4.01,0.85,0.25,0.45],["Jerome Williams",5.08,4.85,0.49,0.83,0.08],["Jerry Stackhouse",15.19,2.96,2.97,0.92,0.62],["Joe Dumars",17.5,2.18,4.38,0.84,0.06],["John Long",3.8,1.3,0.7,0.4,0.1],["John Salley",7.99,4.66,1.09,0.66,1.64],["Johnny Dawkins",6.5,2.3,4.1,1,0],["Jud Buechler",5.5,2.7,1.1,0.7,0.3],["Lance Blanks",1.59,0.5,0.54,0.25,0.05],["Lindsey Hunter",10.95,2.71,3.25,1.48,0.18],["Litterial Green",2,0.5,0.9,0.4,0],["Lou Roe",1.8,1.6,0.3,0.2,0.2],["Loy Vaught",3.4,3.9,0.3,0.4,0.2],["Malik Sealy",7.7,2.8,1.3,0.8,0.3],["Marcus Liberty",2.9,1.6,0.4,0.3,0.1],["Mark Aguirre",12.62,3.77,1.86,0.52,0.18],["Mark Macon",4.03,1.17,0.99,0.99,0.01],["Mark Randall",2.8,1.6,0.3,0.1,0.1],["Mark West",5.73,4.74,0.22,0.28,1.21],["Melvin Newbern",3.6,1.1,1.7,0.7,0],["Michael Curry",4.24,1.67,0.53,0.47,0.07],["Negele Knight",4.1,1.3,2.6,0.5,0.1],["Olden Polynice",9.36,8.37,0.47,0.54,0.55],["Oliver Miller",8.5,7.4,1.5,0.9,1.8],["Orlando Woolridge",13.66,3.31,1.52,0.5,0.44],["Otis Thorpe",13.66,8.15,1.8,0.65,0.35],["Pete Chilcutt",3.8,3.3,0.5,0.3,0.4],["Rafael Addison",8.3,3.1,1.4,0.7,0.3],["Rick Mahorn",2.43,3.06,0.3,0.2,0.1],["Scot Pollard",2.7,2.2,0.3,0.2,0.3],["Scott Hastings",1.38,0.88,0.24,0.06,0.06],["Sean Elliott",12.1,3.6,2.7,0.7,0.4],["Stacey Augmon",4.5,2.5,0.8,0.5,0.5],["Steve Henson",1.51,0.09,0.29,0.04,0],["Terry Mills",13.51,6.18,1.65,0.61,0.48],["Theo Ratliff",5.34,3.88,0.25,0.33,1.61],["Tree Rollins",1,1.1,0.1,0.1,0.5],["Vinnie Johnson",10.75,3.25,3.2,0.9,0.2],["William Bedford",3.75,1.9,0.35,0.08,0.54]]],
    ["DET","2000s",[["Allen Iverson",17.4,3.1,4.9,1.6,0.1],["Amir Johnson",3.76,3.75,0.41,0.36,1.17],["Antonio McDyess",8.73,7.04,1.05,0.68,0.72],["Arron Afflalo",4.3,1.8,0.65,0.4,0.15],["Ben Wallace",7.89,12.88,1.63,1.57,2.76],["Billy Owens",4.4,4.6,1.2,0.7,0.3],["Bob Sura",3.8,1.9,1.7,0.7,0.2],["Brian Cardinal",2.1,1.26,0.23,0.36,0.07],["Carlos Arroyo",4.18,1.44,3.14,0.49,0.06],["Carlos Delfino",4.38,2.4,0.94,0.5,0.15],["Chauncey Billups",17.01,3.3,6.36,1.07,0.15],["Chris Webber",11.3,6.7,3,1,0.6],["Christian Laettner",12.2,6.7,2.3,1,0.5],["Chucky Atkins",9.95,1.79,3.26,0.69,0.08],["Clifford Robinson",13.39,4.35,2.9,1.1,1.15],["Corliss Williamson",12.05,4.14,1.06,0.58,0.3],["Dale Davis",1.46,2.58,0.26,0.12,0.55],["Damon Jones",5.1,1.5,2.1,0.3,0],["Dana Barros",7.58,1.73,2.09,0.5,0.03],["Darko Miličić",1.58,1.21,0.25,0.14,0.49],["Darvin Ham",1.43,1.23,0.21,0.15,0.1],["Don Reid",1.67,1.15,0,0.19,0.57],["Elden Campbell",5.06,3.04,0.64,0.3,0.61],["Eric Montross",1.57,2.3,0.24,0.15,0.34],["Grant Hill",25.8,6.6,5.2,1.4,0.6],["Hubert Davis",1.68,0.75,0.67,0.09,0],["Jarvis Hayes",6.7,2.2,0.8,0.6,0.1],["Jason Maxiell",5.91,3.87,0.35,0.32,0.86],["Jerome Williams",8.08,9.26,0.86,1.2,0.3],["Jerry Stackhouse",24.98,3.93,4.96,1.17,0.53],["Joe Smith",12.3,7.1,1.1,0.7,0.7],["John Crotty",4.7,1.1,1.9,0.4,0.1],["John Wallace",5.9,2.1,0.6,0.3,0.4],["Jon Barry",7.96,2.6,2.95,0.95,0.2],["Jud Buechler",2.79,1.6,0.65,0.4,0.25],["Kwame Brown",4.2,5,0.6,0.4,0.4],["Lindsey Hunter",6.21,1.79,2.47,1.03,0.18],["Loy Vaught",1.7,2.1,0.3,0.1,0.1],["Mateen Cleaves",5.4,1.7,2.7,0.6,0],["Maurice Evans",5,2,0.8,0.5,0.2],["Mehmet Okur",8.24,5.3,1,0.4,0.7],["Michael Curry",4.59,1.67,1.43,0.5,0.08],["Mike James",6.3,2.2,3.7,1,0],["Mikki Moore",4.74,3.45,0.44,0.28,0.76],["Nazr Mohammed",4.93,4.21,0.23,0.44,0.68],["Rasheed Wallace",13.4,7.22,1.82,0.99,1.57],["Richard Hamilton",18.82,3.55,3.86,0.89,0.17],["Rodney Stuckey",10.97,3,4.02,0.96,0.1],["Ronald Dupree",2.61,1.66,0.44,0.16,0.17],["Ronald Murray",6.87,1.66,2.85,0.7,0.18],["Tayshaun Prince",12.67,4.72,2.63,0.61,0.62],["Terry Mills",6.7,4.8,1,0.5,0.3],["Tony Delk",7.8,2.2,1.4,0.6,0],["Tremaine Fowlkes",1.2,1.5,0.4,0.3,0.1],["Walter Herrmann",3.54,1.64,0.43,0.1,0.07],["Will Bynum",7.2,1.3,2.8,0.6,0],["Željko Rebrača",6.19,3.44,0.4,0.32,0.8]]],
    ["DET","2010s",[["Andre Drummond",14.11,13.71,1.14,1.34,1.56],["Anthony Tolliver",7.32,3.29,0.91,0.4,0.26],["Aron Baynes",5.63,4.56,0.5,0.25,0.55],["Austin Daye",5.86,2.91,0.82,0.43,0.44],["Avery Bradley",15,2.4,2.1,1.2,0.2],["Ben Gordon",12.37,2.22,2.37,0.69,0.17],["Ben Wallace",3.37,6.58,1.17,1.01,1.01],["Beno Udrih",5.8,1.5,3.4,0.3,0],["Blake Griffin",23.32,7.28,5.6,0.62,0.4],["Boban Marjanović",5.75,3.45,0.44,0.2,0.3],["Brandon Jennings",14.08,2.75,6.58,1.12,0.1],["Brandon Knight",13.07,3.25,3.91,0.75,0.15],["Bruce Brown",4.3,2.5,1.2,0.5,0.5],["Caron Butler",5.9,2.5,1,0.6,0.1],["Cartier Martin",1.6,0.9,0.5,0.1,0],["Charlie Villanueva",9.47,3.85,0.66,0.51,0.6],["Chris Wilcox",6.32,4.28,0.65,0.46,0.34],["Chucky Atkins",4,0.7,2.3,0.4,0],["D.J. Augustin",10.6,1.9,4.9,0.6,0],["DaJuan Summers",3.13,0.83,0.3,0.17,0.13],["Damien Wilkins",3.2,1.7,0.7,0.5,0.2],["Darrun Hilliard",3.65,1,0.75,0.25,0.05],["Dwight Buycks",7.4,1.4,2,0.7,0.1],["Eric Moreland",2.1,4.1,1.2,0.5,0.8],["Ersan İlyasova",11.3,5.4,1.1,0.7,0.5],["Gigi Datome",2.51,1.39,0.33,0.21,0],["Glenn Robinson III",4.2,1.5,0.4,0.3,0.2],["Greg Monroe",14.31,9.22,2.27,1.2,0.62],["Henry Ellenson",3.81,2.21,0.47,0.1,0.03],["Ish Smith",9.83,2.75,4.49,0.72,0.27],["James Ennis III",7.5,2.5,0.8,0.6,0.2],["Jason Maxiell",6.21,4.87,0.56,0.45,0.76],["Jodie Meeks",10.92,1.7,1.29,0.95,0.1],["Joel Anthony",1.55,1.68,0.1,0.17,0.89],["John Lucas III",4.7,0.8,2.9,0.4,0],["Jon Leuer",7.77,4.32,1.05,0.35,0.24],["Jonas Jerebko",7.21,4.25,0.74,0.67,0.25],["Josh Harrellson",2.9,2.4,0.5,0.2,0.5],["Josh Smith",15.52,6.91,3.67,1.37,1.48],["José Calderón",5.68,1.67,3.86,0.59,0.1],["Kentavious Caldwell-Pope",11.67,3.01,1.56,1.15,0.2],["Khris Middleton",6.1,1.9,1,0.6,0.1],["Khyri Thomas",2.3,0.8,0.3,0.3,0.2],["Kim English",2.9,0.9,0.6,0.4,0.1],["Kwame Brown",3.3,3.7,0.5,0.3,0.3],["Kyle Singler",8.68,3.54,0.97,0.68,0.45],["Langston Galloway",7.48,1.89,1.06,0.54,0.1],["Luke Kennard",8.57,2.63,1.75,0.51,0.2],["Marcus Morris",14.05,4.85,2.25,0.75,0.3],["Reggie Bullock",8.59,2.36,1.48,0.58,0.14],["Reggie Jackson",16.26,2.92,5.58,0.68,0.1],["Richard Hamilton",15.92,2.48,3.69,0.7,0.1],["Rodney Stuckey",14.41,2.93,3.89,0.94,0.16],["Spencer Dinwiddie",4.43,1.4,2.76,0.52,0.15],["Stanley Johnson",7.08,3.47,1.49,0.96,0.25],["Steve Blake",4.4,1.5,3.4,0.4,0.1],["Tayshaun Prince",12.62,4.51,2.65,0.5,0.43],["Thon Maker",5.5,3.7,0.9,0.4,1.1],["Tobias Harris",16.8,5.29,1.95,0.7,0.42],["Tracy McGrady",8,3.5,3.5,0.9,0.5],["Viacheslav Kravtsov",3.1,1.8,0.4,0.2,0.4],["Walker Russell",3,0.9,2.1,0.6,0],["Wayne Ellington",12,2.1,1.5,1.1,0.1],["Will Bynum",8.69,1.69,3.54,0.78,0.1],["Zaza Pachulia",3.9,3.9,1.3,0.5,0.3]]],
    ["DET","2020s",[["Taj Gibson",1.7,1.9,0.6,0.2,0.4],["Wayne Ellington",9.6,1.8,1.5,0.4,0.2],["Alec Burks",12.8,3.1,2.2,0.7,0.2],["Tobias Harris",13.5,5.5,2.4,0.9,0.6],["Cory Joseph",7.7,2.3,3.5,0.7,0.2],["Bojan Bogdanovic",21.6,3.8,2.6,0.6,0.1],["Evan Fournier",6.9,1.8,1.5,0.9,0.2],["Dennis Schröder",13.1,2.6,5.4,0.9,0.2],["Kelly Olynyk",9.1,4.4,2.8,0.8,0.5],["Mason Plumlee",10.4,9.3,3.6,0.8,0.9],["Tim Hardaway Jr.",11,2.4,1.6,0.5,0.1],["Rodney McGruder",5.6,2,0.9,0.5,0.1],["Jerami Grant",20.8,4.3,2.6,0.8,1.1],["Joe Harris",2.4,0.8,0.6,0.2,0.1],["Jahlil Okafor",5.4,2.4,0.5,0.2,0.2],["Malik Beasley",16.3,2.6,1.7,0.9,0.1],["Caris LeVert",7.4,2,2.7,0.9,0.7],["Cheick Diallo",3.7,4,0,0.3,0],["Josh Jackson",13.4,4.1,2.3,0.9,0.8],["Dennis Smith Jr.",6.7,2.4,3.3,1,0.6],["Frank Jackson",10.2,1.9,0.9,0.5,0.1],["Derrick Walton Jr.",6.3,3.3,7,2.3,1.3],["Marvin Bagley III",11.7,6.7,0.9,0.5,0.6],["Troy Brown Jr.",4.2,2.4,1,0.4,0.1],["Hamidou Diallo",10.6,4.5,1.4,1,0.4],["Kevin Huerter",10,3.5,2.6,0.9,0.5],["Chimezie Metu",6.5,3.8,0.9,0.8,0.3],["Jontay Porter",4.4,3.2,2.3,0.8,0.8],["Carsen Edwards",5.8,1.5,3.5,0.5,0],["Tyler Cook",4.9,3,0.5,0.3,0.1],["Duncan Robinson",12.2,2.7,2.1,0.6,0.3],["Trayvon Palmer",0,2,0,0,0],["Justin Robinson",3.1,0.8,1.3,0.4,0],["Sekou Doumbouya",5.1,2.6,0.8,0.4,0.2],["Quentin Grimes",7,2,1.3,0.7,0.1],["Deividas Sirvydis",1.6,1.8,0.3,0.6,0.1],["Javonte Green",6.9,2.8,0.7,1.2,0.3],["Jaysean Paige",0,1,1,0,0],["James Wiseman",8.6,5.6,0.8,0.2,0.6],["Killian Hayes",7.7,2.9,5.2,1.1,0.5],["Saddiq Bey",14.2,5,2.1,0.8,0.2],["R.J. Hampton",6.4,1.9,1.1,0.6,0.2],["Isaiah Stewart",9.1,6.8,1.3,0.4,1.2],["Paul Reed",5.9,3.6,1.1,0.9,0.8],["Cassius Stanley",5.8,2.1,0.4,0.6,0.2],["Malachi Flynn",5.5,1.7,1.9,0.6,0.1],["Saben Lee",5.6,2.2,3.2,0.8,0.3],["Zavier Simpson",6,2.9,3.6,1,0.4],["Braxton Key",4.2,2.4,0.5,0.5,0.5],["Lindy Waters III",4.9,2.1,1,0.5,0.2],["Luka Garza",5.8,3.1,0.6,0.3,0.2],["Isaiah Livers",6,2.6,1,0.6,0.4],["Cade Cunningham",22,5.5,7.6,1.1,0.7],["Malcolm Cazalon",0,0,0,0,0],["Eugene Omoruyi",7,2.8,0.7,0.7,0.1],["Stanley Umude",3.6,1.1,0.2,0.7,0.7],["Jamorko Pickett",3.8,2.5,0.5,0,0.5],["Micah Potter",4,3,0,0.3,0.3],["Jaden Ivey",16.4,3.8,4.3,0.8,0.4],["Jalen Duren",13.6,10.3,2,0.7,0.9],["Wendell Moore Jr.",1.7,1,0.7,0.3,0.3],["Jared Rhoden",4.1,2.2,0.6,0.2,0.5],["Ron Harper Jr.",4,7,2,0,0],["Marcus Sasser",6.7,1.3,2.5,0.6,0.1],["Buddy Boeheim",2.5,0.8,0.3,0.1,0.1],["Simone Fontecchio",8.2,3.3,1.2,0.6,0.2],["Ausar Thompson",9.6,5.7,2.4,1.6,0.8],["Colby Jones",2,4,2,0,0],["Bobi Klintman",1.9,1.2,0.7,0.3,0.1],["Tosan Evbuomwan",5.9,3.5,0.9,0.4,0.3],["Ronald Holland II",7.3,3.4,1.1,0.9,0.2],["Isaac Jones",1.3,0.7,0.1,0,0.1],["Chaz Lanier",2.4,0.7,0.5,0.2,0],["Tolu Smith",8.8,5.7,0.5,0.1,0.2],["Daniss Jenkins",5.2,1.3,2.1,0.5,0.1]]],
    ["GSW","1960s",[["Al Attles",9.55,3.73,3.6,null,null],["Andy Johnson",8.92,4.11,2.31,null,null],["Barry Kramer",3.1,1.8,0.8,null,null],["Bill Turner",6.52,4.42,0.66,null,null],["Bob McNeill",4.1,1.6,2.3,null,null],["Bob Warlick",8.03,3.49,2.08,null,null],["Bobby Lewis",4.76,1.64,1.12,null,null],["Bud Koper",4.6,1.1,0.8,null,null],["Bud Olsen",3.84,3.01,0.51,null,null],["Clyde Lee",9.91,11.69,1.31,null,null],["Connie Dierking",8,6.5,1,null,null],["Cotton Nash",4.2,2.4,0.5,null,null],["Dale Schlueter",5.8,7,1,null,null],["Dave Lattin",2.2,2.4,0.3,null,null],["Ed Conlin",5.86,2.83,1.41,null,null],["Ernie Beck",3.9,1.9,1.1,null,null],["Frank Radovich",2.4,1.4,0.1,null,null],["Fred Hetzel",13.25,7.03,1.27,null,null],["Gary Hill",4.85,1.7,1.41,null,null],["Gary Phillips",7.31,2.85,2.13,null,null],["George Lee",5.11,2.68,0.72,null,null],["Guy Rodgers",12.98,5.02,8.47,null,null],["Hubie White",3.2,1.2,1,null,null],["Jeff Mullins",18.23,5.54,3.87,null,null],["Jim King",11.94,4.1,3.55,null,null],["Joe Ellis",7.8,4.73,1.19,null,null],["Joe Graboski",7.27,4.42,1.31,null,null],["Joe Ruklick",3.45,2.5,0.4,null,null],["John Rudometkin",6,4.2,0.7,null,null],["Keith Erickson",3.6,2.5,0.6,null,null],["Kenny Sears",4.74,2.21,0.9,null,null],["McCoy McLemore",7.84,6.2,0.85,null,null],["Nate Thurmond",16.42,17.93,2.39,null,null],["Paul Arizin",22.47,7.99,2.44,null,null],["Paul Neumann",13.46,3.23,3.45,null,null],["Rick Barry",30.59,9.91,2.89,null,null],["Ron Williams",7.8,2.4,3.3,null,null],["Rudy LaRusso",21.26,8.86,2.2,null,null],["Ted Luckenbill",2.25,1.88,0.4,null,null],["Tom Gola",14.22,9.61,4.65,null,null],["Tom Meschery",12.88,8.56,1.48,null,null],["Vern Hatton",4.51,2.09,1.16,null,null],["Wayne Hightower",10.02,6.06,1.17,null,null],["Willie Naulls",11,6.7,1.2,null,null],["Wilt Chamberlain",41.46,25.1,3.02,null,null],["Woody Sauldsberry",9.9,6.3,1.6,null,null],["York Larese",5.4,1.4,1.7,null,null]]],
    ["GSW","1970s",[["Adrian Smith",6.05,1.1,1.74,null,null],["Al Attles",3.77,1.43,2.55,null,null],["Bill Turner",3.23,2.24,0.4,null,null],["Bob Portman",5.66,3.29,0.58,null,null],["Bobby Lewis",7.2,2.2,2.7,null,null],["Bubbles Hawkins",3.9,0.9,0.5,0.3,0.3],["Butch Beard",11.52,4.39,4,1.45,0.1],["Cazzie Russell",19.2,4.69,2.56,0.7,0.2],["Charles Dudley",5.75,3.26,3.57,0.81,0.03],["Charles Johnson",7.92,2.56,1.78,1.23,0.1],["Clifford Ray",8.03,9.03,1.82,0.94,1.04],["Clyde Lee",7.65,10.58,0.93,0.5,0.3],["Dale Schlueter",3.6,3.7,0.4,null,null],["Dave Gambee",7.2,3.3,0.8,null,null],["Derrek Dickey",6.43,5.15,1.16,0.44,0.17],["Dwight Davis",4.39,3.04,0.69,0.3,0.34],["E.C. Coleman",6.4,5.2,1.4,0.9,0.3],["George Johnson",4.39,6.37,0.78,0.49,1.9],["Gus Williams",10.46,2.46,3.36,1.65,0.25],["Jamaal Wilkes",16.54,8.22,2.32,1.39,0.3],["Jeff Mullins",17.19,4.09,4.15,0.83,0.21],["Jerry Lucas",17.53,15.18,3.22,null,null],["Jim Barnett",11.9,3.04,3.44,0.7,0.1],["Jo Jo White",12.3,2.5,4.6,0.9,0.1],["Joe Ellis",9.29,5.3,1.44,0.7,0.2],["John Lucas",16.1,3,9.3,1.9,0.1],["Larry McNeill",4.54,2.56,0.2,0.26,0.1],["Levi Fontaine",3.8,0.4,0.6,null,null],["Nate Thurmond",18.63,15.64,3.12,0.7,2.9],["Nate Williams",9.35,2.56,0.84,0.74,0.24],["Nick Jones",5.3,1.04,1.09,null,null],["Odis Allison",1.9,1.3,0.3,null,null],["Phil Smith",17.3,3.59,3.89,1.24,0.26],["Purvis Short",10.6,4.6,1.3,0.7,0.2],["Ralph Ogden",1.3,1,0.3,null,null],["Raymond Townsend",4.7,0.8,1.4,0.4,0.1],["Rick Barry",23.97,6.39,5.78,2.32,0.48],["Rickey Green",4.5,1.5,2,0.8,0],["Ricky Marsh",4.5,1.3,1.5,0.5,0.3],["Robert Parish",12.91,9.14,1.23,1,1.85],["Ron Williams",11.36,2.1,4.24,null,null],["Sonny Parker",11.12,4.44,2.24,1.44,0.4],["Steve Bracey",3.2,0.9,1.2,0.3,0],["Tom Abernethy",6,3.1,1.1,0.6,0.2],["Vic Bartolome",0.9,1.6,0.1,null,null],["Walt Hazzard",4.5,1.7,2.4,null,null],["Wayne Cooper",4.6,4.3,0.3,0.1,0.7],["Wesley Cox",4.64,2.76,0.34,0.46,0.2]]],
    ["GSW","1980s",[["Ben McDonald",6.47,3.4,1.45,0.45,0.09],["Bernard King",22.54,6.36,3.55,0.95,0.35],["Billy Reid",3.2,1,1.2,0.6,0.1],["Chris Engler",1.59,1.99,0.2,0.15,0.21],["Chris Mullin",19.33,3.53,3.85,1.63,0.45],["Chris Washburn",3.86,2.83,0.48,0.18,0.16],["Chuck Aleksinas",5.1,3.6,0.5,0.2,0.2],["Clifford Ray",4.38,4.68,1.63,0.51,0.31],["Clinton Smith",3.1,1.4,1.1,0.3,0],["Darnell Hillman",4,3.7,1,0.4,0.5],["Darren Tillis",3.6,2.6,0.3,0.2,0.8],["Dave Feitl",6.5,4.8,0.8,0.2,0.1],["Dave Hoppen",5.9,4.6,0.8,0.4,0.2],["Derek Smith",2.2,1.4,0.1,0,0.1],["Don Collins",7.2,2.1,1.1,0.7,0.2],["Gary Plummer",3.8,2,0.4,0.2,0.2],["Geoff Huston",4.2,0.8,4.2,0.5,0],["Greg Ballard",7.91,4.82,1.2,0.74,0.15],["Hank McDowell",3.1,2.92,0.57,0.17,0.3],["Jerome Whitehead",6.88,4.97,0.42,0.35,0.3],["Jo Jo White",9.9,2.3,3.1,1.1,0.2],["Joe Barry Carroll",20.36,8.3,1.93,1.08,1.72],["Joe Hassett",6.58,1.11,1.82,0.37,0.02],["John Lucas",10.7,2.57,7.27,1.52,0],["John Starks",4.1,1.1,0.8,0.6,0.1],["Larry Smith",8.47,10.46,1.17,0.85,0.63],["Lester Conner",7.58,3.04,3.94,1.69,0.12],["Lewis Lloyd",8.36,3.13,1.55,0.71,0.35],["Lorenzo Romar",6.16,1.35,3.77,0.87,0.14],["Manute Bol",3.9,5.8,0.3,0.1,4.3],["Mickey Johnson",13.81,6.65,2.7,1.14,0.51],["Mike Bratz",6.11,1.42,2.73,0.92,0.1],["Mike Gale",5.6,2.5,3.5,1.6,0.4],["Mitch Richmond",22,5.9,4.2,1,0.2],["Othell Wilson",4.4,1.8,2.9,1,0.2],["Otis Smith",11.29,3.98,2.09,1.27,0.54],["Pace Mannion",2.1,1,0.8,0.4,0],["Perry Moss",3.6,1.5,1.4,0.7,0],["Pete Verhoeven",3.4,2.6,0.5,0.5,0.3],["Peter Thibeaux",4.95,1.58,0.48,0.34,0.35],["Phil Smith",15.5,2.9,3.7,1.2,0.3],["Purvis Short",20.58,4.86,3,1.22,0.19],["Ralph Sampson",9.3,6.61,1.82,0.6,1.36],["Raymond Townsend",5.4,1.2,1.5,0.8,0.1],["Rickey Brown",5.21,4,0.3,0.29,0.37],["Robert Parish",17,10.9,1.7,0.8,1.6],["Rod Higgins",11.44,4.05,2.01,0.65,0.43],["Ron Brewer",10.06,1.8,1.14,1.14,0.4],["Russell Cross",3.7,1.8,0.5,0.3,0.2],["Sam Williams",7.22,5.04,0.59,0.86,1.2],["Sleepy Floyd",17.68,3.28,6.74,1.61,0.3],["Sonny Parker",8.66,3.73,2.02,1.21,0.27],["Steve Alford",6.3,1.2,1.5,0.8,0.1],["Steve Burtt",4.2,0.6,0.4,0.4,0.1],["Steve Harris",10.3,2.4,1.6,1,0.1],["Tellis Frank",6.7,3.53,1.14,0.61,0.27],["Terry Teagle",13.01,2.69,1.33,0.89,0.27],["Tom Abernethy",4.75,2.63,1.14,0.45,0.17],["Tony White",6.2,0.8,1.4,0.5,0.1],["Wayne Cooper",11,6.4,0.5,0.3,1],["Winston Garland",13.54,3.83,6.4,1.97,0.15],["World B. Free",23.37,2.77,5.4,1.05,0.15]]],
    ["GSW","1990s",[["Adonal Foyle",2.96,3.79,0.34,0.24,0.94],["Alton Lister",5.18,4.99,0.9,0.23,0.94],["Andre Spencer",9.45,4.18,1.22,0.74,0.4],["Andrew DeClercq",4.68,3.63,0.48,0.45,0.35],["Antawn Jamison",9.6,6.4,0.7,0.8,0.3],["Avery Johnson",10.9,2.1,5.3,1.4,0.1],["B.J. Armstrong",10.47,1.93,3.96,0.7,0.06],["Billy Owens",15,7.87,3.37,1.06,0.8],["Bimbo Coles",7.85,2.28,4.1,0.9,0.17],["Brian Shaw",6.4,3.9,4.4,0.9,0.4],["Byron Houston",4.12,3.38,0.71,0.55,0.45],["Carlos Rogers",8.9,5.7,0.8,0.4,1.1],["Chris Gatling",9.18,5.08,0.58,0.56,0.77],["Chris Mills",10.3,5,2.2,0.8,0.3],["Chris Mullin",21.11,4.97,4.04,1.74,0.71],["Chris Webber",17.5,9.1,3.6,1.2,2.2],["Clarence Weatherspoon",10.7,8.3,1.6,1.4,0.7],["Clifford Rozier",5.01,5.23,0.55,0.4,0.55],["David Vaughn",5.2,4.6,0.8,0.5,0.3],["David Wood",4.55,2.61,0.67,0.34,0.16],["Donald Royal",3.8,2.6,0.4,0.3,0.3],["Donyell Marshall",10.55,6.02,1.38,0.77,0.83],["Duane Ferrell",1.72,0.89,0.43,0.36,0.1],["Dwayne Morton",4.1,1.4,0.4,0.3,0.4],["Ed Nealy",1.5,1.6,0.4,0.3,0],["Erick Dampier",10.66,8.28,1.1,0.5,1.51],["Felton Spencer",3.45,4.11,0.25,0.37,0.57],["Jason Caffey",9.75,5.9,0.77,0.56,0.21],["Jeff Grayer",7.46,3,1.12,0.54,0.19],["Jerome Kersey",6.7,4.8,1.5,1.2,0.6],["Jim Jackson",18.9,5.6,5.1,1.2,0.1],["Jim Petersen",3.74,3.06,0.41,0.27,0.53],["Joe Smith",17.05,8.21,1.32,0.94,1.22],["John Starks",13.8,3.3,4.7,1.4,0.1],["Jon Barry",3.8,0.9,1.3,0.5,0.2],["Josh Grant",3,1.7,0.5,0.3,0.2],["Jud Buechler",4.69,2.12,0.96,0.54,0.2],["Keith Jennings",6.67,1.55,3.78,1.03,0],["Kelvin Upshaw",5.6,1.2,1.1,1.1,0],["Kevin Pritchard",3.9,1,1.3,0.5,0.1],["Kevin Willis",11.3,7.8,0.7,0.5,0.6],["Larry Robinson",2.3,1,0.5,0.4,0],["Latrell Sprewell",20.1,4.32,4.64,1.74,0.69],["Les Jepsen",1.3,1.8,0,0,0.1],["Manute Bol",1.97,3.62,0.47,0.19,3.11],["Mario Elie",7.77,3.09,2.01,0.82,0.23],["Mark Price",11.3,2.6,4.9,1,0],["Mike Smrek",1.74,2.09,0.12,0.3,0.52],["Mitch Richmond",22.99,5.25,3,1.45,0.35],["Muggsy Bogues",5.53,2.12,4.82,1.14,0.06],["Paul Mokeski",1.6,1.9,0.3,0.2,0.1],["Ray Owes",3.1,2.9,0.3,0.3,0.4],["Ricky Pierce",12.5,2.4,1.5,0.8,0.1],["Rod Higgins",10.07,4.45,1.4,0.59,0.53],["Rony Seikaly",12.1,7.66,1.17,0.6,1.06],["Ryan Lorthridge",7.4,1.9,2.7,0.8,0],["Scott Burrell",4.9,2.7,1.2,0.5,0.3],["Sean Higgins",8.3,2.3,2.3,0.4,0.2],["Steve Johnson",3.8,2.4,0.7,0.2,0.2],["Terry Cummings",9.1,5.1,1.2,0.9,0.2],["Terry Teagle",16.1,4.5,1.9,1.1,0.2],["Tim Hardaway",19.75,3.63,9.31,1.94,0.18],["Tim Legler",7.3,1.7,1.1,0.5,0],["Todd Fuller",4.06,3.34,0.26,0.1,0.3],["Tom Gugliotta",10.9,7.4,3.1,1.3,0.6],["Tom Tolbert",7.24,4.15,0.91,0.41,0.43],["Tony Delk",9.22,2.04,2.4,0.8,0.2],["Tyrone Hill",7.4,7.52,0.6,0.64,0.47],["Uwe Blab",2.1,2.5,0.6,0,0.6],["Victor Alexander",9.22,5,0.94,0.52,0.66],["Vincent Askew",6.08,2.8,2.36,0.58,0.28],["Winston Garland",5.3,2.2,3.1,0.9,0.1],["Šarūnas Marčiulionis",14.69,2.83,2.44,1.43,0.1]]],
    ["GSW","2000s",[["Adam Keefe",2.5,3.1,0.5,0.4,0.3],["Adonal Foyle",4.65,5.27,0.54,0.4,1.91],["Al Harrington",14.67,5.74,1.85,0.95,0.22],["Andris Biedriņš",8.43,8.19,1.04,0.67,1.24],["Antawn Jamison",21.87,7.62,1.99,1.01,0.41],["Anthony Morrow",10.1,3,1.2,0.5,0.2],["Anthony Randolph",7.9,5.8,0.8,0.7,1.2],["Anthony Roberson",5.6,1.1,0.5,0.6,0],["Austin Croshere",3.9,2.4,0.7,0.2,0.1],["Avery Johnson",4.6,0.7,2.4,0.6,0.1],["Baron Davis",20.12,4.45,8.13,2.02,0.44],["Bill Curley",3.2,2.07,0.45,0.46,0.32],["Bob Sura",9.52,3.5,3.72,0.98,0.14],["Brandan Wright",6.18,3.31,0.35,0.4,0.75],["Brian Cardinal",9.6,4.2,1.4,0.9,0.3],["C.J. Watson",7.8,2.06,2.23,0.99,0.07],["Calbert Cheaney",5.34,2.56,1.26,0.52,0.18],["Chris Mills",8.94,3.76,1.31,0.54,0.2],["Chris Mullin",5.8,2.1,1,0.8,0.5],["Chris Porter",8.6,3.7,1.2,0.9,0.1],["Clifford Robinson",10.68,3.49,2.79,0.87,0.9],["Corey Maggette",18.6,5.5,1.8,0.9,0.2],["Corie Blount",6.8,8.3,1.3,0.8,0.4],["Dale Davis",3.1,4.3,0.6,0.4,0.9],["Danny Fortson",10.22,10.72,1.4,0.56,0.15],["Dean Oliver",1.84,0.7,1.27,0.33,0],["Derek Fisher",12.64,2.74,4.21,1.26,0.1],["Donyell Marshall",14.2,10,2.6,1.1,1.1],["Earl Boykins",8.8,1.3,3.3,0.6,0.1],["Eduardo Nájera",4.2,2.8,0.9,0.4,0.2],["Erick Dampier",8.95,7.51,0.97,0.32,1.83],["Gilbert Arenas",15.6,4.01,5.35,1.5,0.2],["Ike Diogu",7.04,3.38,0.38,0.2,0.44],["Jamal Crawford",19.7,3.3,4.4,0.9,0.2],["Jason Caffey",12,6.8,1.7,0.9,0.3],["Jason Richardson",18.28,5.4,3.19,1.24,0.44],["Jiří Welsch",1.6,0.8,0.7,0.2,0.1],["John Starks",14.7,2.8,5.2,1.1,0.1],["Josh Powell",3.5,2.3,0.6,0.2,0.4],["Keith McLeod",5.3,0.8,1.7,0.7,0.1],["Kelenna Azubuike",10.43,4.02,1.12,0.65,0.47],["Larry Hughes",15.8,4.59,4.32,1.71,0.44],["Marc Jackson",11.03,6.19,0.99,0.6,0.5],["Marco Belinelli",6.26,1.13,1.4,0.59,0],["Mark Davis",6.2,3.7,1.7,1.1,0.2],["Matt Barnes",8.28,4.5,2,0.85,0.5],["Mickaël Piétrus",8.63,3.33,0.84,0.73,0.47],["Mike Dunleavy",10.62,4.7,2.48,0.82,0.28],["Monta Ellis",16.01,3.71,3.46,1.41,0.28],["Mookie Blaylock",9.62,3.34,6.03,1.9,0.26],["Nick Van Exel",12.6,2.7,5.3,0.5,0.1],["Patrick O'Bryant",1.66,1.24,0.36,0.28,0.44],["Paul McPherson",6.8,1.4,1,0.6,0],["Rob Kurz",3.9,2,0.5,0.4,0.5],["Ronny Turiaf",5.9,4.6,2.1,0.4,2.1],["Sam Jacobson",5,1.4,0.6,0.6,0.1],["Sam Mack",5,1.7,1,0.8,0],["Speedy Claxton",11.68,2.9,5.24,1.73,0.16],["Stephen Jackson",19.57,4.4,5.04,1.37,0.43],["Terry Cummings",8.4,4.9,1,0.6,0.4],["Tim Legler",3.3,1,1,0.2,0],["Tony Farmer",6.3,4,1,0.9,0.2],["Troy Murphy",11.24,8.22,1.27,0.64,0.43],["Vinny Del Negro",2.7,1.1,2.1,0.2,0],["Vonteego Cummings",8.42,2.31,3.35,1.11,0.2],["Šarūnas Jasikevičius",4.3,0.8,2.3,0.5,0],["Žarko Čabarkapa",4.39,2.14,0.45,0.24,0.1]]],
    ["GSW","2010s",[["Acie Law",5.22,1.2,1.76,0.76,0],["Al Thornton",6,2.6,0.5,0.3,0.1],["Alfonzo McKinnie",4.7,3.4,0.4,0.3,0.2],["Anderson Varejão",2.09,2.14,0.7,0.2,0.2],["Andre Iguodala",7.24,3.9,3.4,1.08,0.47],["Andrew Bogut",6.13,8.11,2.16,0.59,1.65],["Andris Biedriņš",2.95,5.26,0.76,0.58,0.97],["Anthony Morrow",13,3.8,1.5,0.9,0.2],["Anthony Randolph",11.6,6.5,1.3,0.8,1.5],["Anthony Tolliver",12.3,7.3,2,0.7,0.8],["Brandan Wright",4,2,0.2,0.1,0.5],["Brandon Rush",5.72,2.76,0.95,0.35,0.54],["C.J. Watson",10.3,2.6,2.8,1.6,0.1],["Carl Landry",10.8,6,0.8,0.4,0.4],["Charles Jenkins",3.83,0.87,2.01,0.41,0.05],["Chris Hunter",4.5,2.8,0.6,0.2,0.6],["Chris Wright",2.9,1.9,0.2,0.3,0.5],["Corey Maggette",19.8,5.3,2.5,0.7,0.1],["Damian Jones",3.55,2.26,0.62,0.3,0.63],["Damion Lee",4.9,2,0.4,0.4,0],["Dan Gadzuric",2.8,3.1,0.4,0.4,0.6],["David Lee",16.68,9.31,2.75,0.81,0.39],["David West",5.74,3.16,2.04,0.6,0.86],["DeMarcus Cousins",16.3,8.2,3.6,1.3,1.5],["Devean George",5.4,2.5,0.7,0.9,0.2],["Dominic McGuire",3.5,3.8,1.7,0.7,0.6],["Dorell Wright",13.8,5,2.36,1.29,0.63],["Draymond Green",9.06,6.95,4.88,1.37,1.09],["Ekpe Udoh",4.65,3.42,0.74,0.52,1.58],["Festus Ezeli",4.19,4.27,0.38,0.3,0.95],["Harrison Barnes",10.05,4.62,1.46,0.68,0.23],["Ian Clark",5.32,1.32,1.11,0.41,0.15],["JaVale McGee",5.5,2.93,0.34,0.25,0.9],["Jacob Evans",1.3,0.8,0.8,0.2,0.1],["James Michael McAdoo",3.02,1.75,0.31,0.26,0.45],["Jarrett Jack",12.9,3.1,5.6,0.8,0.1],["Jason Thompson",2.1,1.9,0.7,0.1,0.3],["Jeff Adrien",2.5,2.5,0.4,0.2,0.2],["Jeremy Lin",2.6,1.2,1.4,1.1,0.3],["Jeremy Tyler",3.67,2.53,0.3,0.3,0.37],["Jermaine O'Neal",7.9,5.5,0.6,0.3,0.9],["Jonas Jerebko",6.3,3.9,1.3,0.4,0.2],["Jordan Bell",3.89,3.11,1.42,0.44,0.89],["Jordan Crawford",8.4,1.5,1.4,0.3,0],["Justin Holiday",4.3,1.2,0.8,0.7,0.2],["Kent Bazemore",2.13,0.61,0.44,0.3,0.1],["Kevin Durant",25.86,7.1,5.41,0.82,1.48],["Kevon Looney",4.46,3.75,0.91,0.48,0.61],["Klay Thompson",19.5,3.46,2.3,0.9,0.54],["Leandro Barbosa",6.74,1.55,1.35,0.6,0.1],["Lou Amundson",4.3,4,0.4,0.3,0.7],["Marreese Speights",7.96,3.77,0.69,0.23,0.43],["Matt Barnes",5.7,4.6,2.3,0.6,0.5],["Mikki Moore",4.63,3.02,1.39,0.25,0.55],["Monta Ellis",24.15,3.66,5.58,2.01,0.34],["Nate Robinson",11.2,2,4.5,1.2,0],["Nick Young",7.3,1.6,0.5,0.5,0.1],["Ognjen Kuzmić",0.96,1.04,0.23,0.1,0.16],["Omri Casspi",5.7,3.8,1,0.3,0.4],["Patrick McCaw",4,1.4,1.23,0.63,0.2],["Quinn Cook",7.7,2.22,1.94,0.33,0],["Reggie Williams",10.58,3.14,1.8,0.54,0.07],["Richard Jefferson",4.76,2.06,0.85,0.36,0.16],["Rodney Carney",5,1.9,0.4,0.4,0.2],["Ronny Turiaf",4.9,4.5,2.1,0.5,1.3],["Shaun Livingston",5.41,2.03,2.41,0.56,0.32],["Stephen Curry",23.53,4.52,6.59,1.72,0.23],["Steve Blake",4.4,2,3.6,0.7,0.2],["Toney Douglas",3.7,1.1,0.8,0.3,0.1],["Vladimir Radmanović",5.56,3.39,1.13,0.66,0.48],["Zaza Pachulia",5.75,5.3,1.75,0.7,0.35]]],
    ["GSW","2020s",[["Andre Iguodala",3,2.7,3,0.7,0.6],["Chris Paul",9.2,3.9,6.8,1.2,0.1],["Al Horford",8.3,4.9,2.6,0.7,1.1],["Stephen Curry",27.4,4.9,5.7,1.1,0.4],["Nemanja Bjelica",6.1,4.1,2.2,0.6,0.4],["Klay Thompson",20.1,3.8,2.5,0.6,0.5],["Cory Joseph",2.4,1.2,1.6,0.2,0.1],["Jimmy Butler",18.8,5.5,5.2,1.4,0.2],["Draymond Green",8.2,6.7,6.6,1.2,0.9],["Kent Bazemore",7.2,3.4,1.6,1,0.5],["JaMychal Green",6.4,3.6,0.9,0.4,0.4],["Otto Porter Jr.",8.2,5.7,1.5,1.1,0.5],["Seth Curry",7.1,1.2,1,0.3,0],["Andrew Wiggins",16.5,4.7,2.1,0.9,0.8],["Dario Saric",8,4.4,2.3,0.5,0.2],["Kristaps Porziņģis",16.7,5.2,2.5,0.6,1.2],["Kelly Oubre Jr.",15.4,6,1.3,1,0.8],["Kevon Looney",5.2,6.7,2,0.5,0.5],["Marquese Chriss",6.5,6.5,1,0,1],["Buddy Hield",11.1,3.2,1.6,0.8,0.3],["Gary Payton II",5.6,2.8,1.1,0.9,0.3],["Damion Lee",7,3.2,1.1,0.6,0.1],["Jordan Bell",2.5,4,1.2,0.5,0.8],["Mychal Mulder",5.6,1,0.4,0.2,0.2],["Donte DiVincenzo",9.4,4.5,3.5,1.3,0.1],["Kevin Knox II",3.3,1.2,0.4,0.1,0.3],["De'Anthony Melton",12.3,3.2,2.6,1.6,0.4],["Jerome Robinson",1.4,0.3,0.2,0,0.1],["Chris Chiozza",2,1.1,1.9,0.4,0],["Juan Toscano-Anderson",4.9,3.4,2.2,0.8,0.3],["Alen Smailagic",1.9,1.1,0.3,0.2,0.3],["Charles Bassey",5.8,4.4,0.5,0.3,0.8],["Ty Jerome",6.9,1.7,3,0.5,0.1],["Eric Paschall",9.5,3.2,1.3,0.3,0.2],["Jordan Poole",17,2.6,3.5,0.7,0.3],["Quinndary Weatherspoon",2.7,1.3,0.5,0.1,0.1],["James Wiseman",11.5,5.8,0.7,0.3,0.9],["Nico Mannion",4.1,1.5,2.3,0.5,0],["Omer Yurtseven",3.8,3.3,0.9,0.2,0.1],["Jonathan Kuminga",12.7,4,1.8,0.6,0.4],["Anthony Lamb",6.7,3.5,1.5,0.5,0.3],["Braxton Key",1,0.7,0,0.7,0],["Pat Spencer",3.5,1.4,1.8,0.4,0.1],["Moses Moody",7.8,2.4,1,0.6,0.3],["Usman Garuba",0.5,1.2,0.2,0.2,0.5],["Gui Santos",5.6,3,1.4,0.5,0.2],["Patrick Baldwin Jr.",3.9,1.3,0.4,0.2,0.1],["Ryan Rollins",1.9,1,0.5,0.1,0.1],["Trayce Jackson-Davis",7.2,5,1.4,0.4,0.9],["Lester Quinones",3.5,1.4,0.8,0.2,0.1],["Nate Williams",8,2.1,1,0.4,0],["Brandin Podziemski",11.6,5.3,3.6,1,0.2],["Yuri Collins",1,1.5,2,1,0],["Jackson Rowe",3.7,1.8,0.7,0.7,0],["Quinten Post",7.9,3.8,1.4,0.4,0.5],["Malevy Leons",3.3,2.1,0.9,0.6,0.4],["Will Richard",6.4,2.5,1.3,1.2,0.1],["LJ Cryer",8.2,1.6,1,0.2,0]]],
    ["HOU","1960s",[["Art Williams",7.6,4.1,5.75,null,null],["Dave Gambee",13.4,5.8,1.2,null,null],["Don Kojis",21.21,9.92,2.6,null,null],["Elvin Hayes",28.4,17.1,1.4,null,null],["Hank Finkel",8.46,5.51,1.08,null,null],["Jim Barnett",12.61,4.06,3.72,null,null],["Jim Ware",2.4,2.6,0.2,null,null],["John Barnhill",9.9,2.3,3.5,null,null],["John Block",17.26,9.8,1.64,null,null],["John Trapp",3.1,2,0.2,null,null],["Johnny Green",13.9,10.1,1.4,null,null],["Jon McGlocklin",12.1,3.1,2.7,null,null],["Nick Jones",5.4,1.6,2.1,null,null],["Pat Riley",8.27,2.12,1.99,null,null],["Rick Adelman",6.3,2.8,3.1,null,null],["Stu Lantz",7.8,3.2,1.4,null,null],["Toby Kimball",9.45,10.3,1.51,null,null]]],
    ["HOU","1970s",[["Alonzo Bradley",5.15,1.9,0.95,0.27,0.06],["Art Williams",5.8,3.7,6.3,null,null],["Bernie Williams",6.94,1.89,2.17,null,null],["Bingo Smith",7.3,4.4,1,null,null],["C.J. Kupec",4,1.9,1,0.2,0.1],["Calvin Murphy",18.96,2.38,4.93,1.67,0.07],["Cliff Meely",8.7,5.55,1.28,0.59,0.72],["Curtis Perry",3.25,3.56,0.65,null,null],["Dave Wohl",5.04,1.16,3.47,0.87,0.05],["Dick Cunningham",2.7,3.9,0.9,null,null],["Dick Gibbs",3.64,2.17,0.8,null,null],["Don Adams",11.15,6.94,2.06,null,null],["Don Kojis",15.3,6.9,1.4,null,null],["Dwight Jones",7.46,5.25,0.88,0.6,0.37],["E.C. Coleman",4.88,4.01,1.2,0.57,0.27],["Ed Ratleff",8.33,4.03,2.65,1.27,0.4],["Elvin Hayes",27.13,16.03,2.53,null,null],["Eric McWilliams",2,1.4,0.1,null,null],["George Johnson",2.18,2.34,0.26,0.3,0.3],["Goo Kennedy",2,1.6,0.2,0.2,0.2],["Greg Smith",8.64,5.72,2.79,null,null],["Gus Bailey",2.48,1.7,1.34,0.44,0.3],["Jack Marin",15.64,4.77,3.23,0.5,0.2],["Jacky Dorsey",2.8,1.2,0.1,0.1,0.1],["Jim Barnett",14.9,3.8,3.6,null,null],["Jimmy Walker",17.52,3.21,5.35,0,0],["Joe Meriweather",10.2,6.4,1,0.4,1.5],["John Block",12.19,6.79,1.51,null,null],["John Johnson",9.45,3.85,2.46,0.64,0.34],["John Lucas",11.75,2.9,7.5,1.75,0.15],["John Trapp",8.08,5.37,1.24,null,null],["John Vallely",2.9,0.5,0.7,null,null],["Johnny Egan",2.46,0.8,1.4,null,null],["Kevin Kunnert",10.43,8.48,1.54,0.52,1.2],["Larry Siegfried",7.49,3.44,5.79,null,null],["Matt Guokas",5.3,1.5,3.4,0.7,0.4],["Mike Dunleavy",7.5,1.58,4.09,0.79,0.1],["Mike Newlin",14.04,3.17,4.27,1.06,0.09],["Moses Malone",19.27,15.39,1.2,0.87,1.74],["Otto Moore",10.81,10.04,1.92,0.8,1.4],["Owen Wells",3,1.1,0.7,0.3,0.1],["Pat Riley",5.3,1.6,2.4,null,null],["Paul McCracken",4.01,2.01,0.67,0,0],["Rick Adelman",7.4,2.3,3.2,null,null],["Rick Barry",13.5,3.5,6.3,1.2,0.5],["Robert Reid",9.12,5.21,2.16,0.85,0.6],["Ron Riley",4.78,4.52,1.34,0.57,0.36],["Rudy Tomjanovich",18.18,8.6,2.11,0.76,0.35],["Rudy White",2.91,1.02,0.87,0.37,0.06],["Slick Watts",3.7,1.7,4,1.2,0.2],["Stan McKenzie",2.85,1.36,0.57,0.3,0],["Steve Hawes",5.49,4.8,1.61,0.63,0.63],["Stu Lantz",17.86,4.13,3.97,null,null],["Toby Kimball",5.21,6.57,1,null,null],["Tom Owens",4.1,3.1,0.4,0.1,0.3],["Zaid Abdul-Aziz",9.53,8.49,1.51,0.76,1.11]]],
    ["HOU","1980s",[["Allen Leavell",9.54,1.67,4.78,1.33,0.17],["Alonzo Bradley",1.9,0.3,0.1,0.1,0],["Bernard Thompson",2.7,1.2,0.6,0.6,0],["Bill Willoughby",7.13,3.93,1.14,0.36,0.77],["Billy Paultz",5.57,4.18,1.13,0.3,0.6],["Buck Johnson",6.34,2.77,1.11,0.57,0.4],["Caldwell Jones",9.7,7.65,1.8,0.6,1.3],["Calvin Garrett",5.33,2.92,1.7,0.64,0.1],["Calvin Murphy",15.22,1.34,2.99,1.29,0.08],["Cedric Maxwell",5.14,3.09,1.11,0.3,0.16],["Chuck Nevitt",1.78,1.66,0.09,0.11,0.86],["Craig Ehlo",2.34,0.94,0.71,0.26,0.09],["Dave Feitl",3.7,1.9,0.4,0.1,0.1],["Derrick Chievous",9.3,3.2,1,0.6,0.1],["Dirk Minniefield",7.7,2.1,5.3,1,0.1],["Dwight Jones",6,3.4,0.5,0.2,0.2],["Elvin Hayes",11.35,6.64,1.57,0.53,0.87],["Frank Johnson",4.4,1.2,2.7,0.6,0],["Granville Waiters",0.6,0.7,0.2,0.1,0.2],["Hakeem Olajuwon",23,12.11,2.03,1.96,3.11],["Hank McDowell",2.03,1.23,0.3,0.06,0.1],["James Bailey",11.38,5.36,1,0.55,0.69],["Jawann Oldham",1.5,1.1,0.1,0.1,0.5],["Jeff Taylor",3.6,1.8,2.5,0.9,0.3],["Jim Petersen",7.65,5.24,1.16,0.44,0.78],["Joe Barry Carroll",12,6.3,1.5,0.6,1.3],["Joe Bryant",10,3.4,2.3,1,0.4],["John Lucas",13.78,2.03,7.96,1.24,0.06],["John Shumate",3.5,2.7,0.8,0.3,0.3],["Larry Micheaux",4.2,2.5,0.4,0.3,0.4],["Lester Conner",2.5,0.7,1.1,0.7,0],["Lewis Lloyd",15.53,3.24,3.57,1.04,0.35],["Lionel Hollins",7.6,2.2,5.2,1,0.1],["Major Jones",4.64,3.64,0.61,0.38,0.46],["Mike Dunleavy",8.73,1.67,3.59,0.77,0.03],["Mike Woodson",12.9,2.4,2.5,1.1,0.2],["Mitchell Wiggins",8.46,2.75,1.57,0.99,0.14],["Moses Malone",28.23,14.67,1.8,0.97,1.56],["Otis Thorpe",16.7,9.6,2.5,1,0.5],["Phil Ford",5.85,1.56,4.46,0.58,0.08],["Purvis Short",11.23,2.74,1.82,0.7,0.2],["Ralph Sampson",19.67,10.45,2.71,1.03,1.89],["Richard Anderson",2.78,1.48,0.54,0.1,0.08],["Rick Barry",12,3.3,3.7,1.1,0.4],["Robert Reid",12.23,4.77,3.18,1.23,0.46],["Rodney McCray",12.47,6.7,3.77,0.84,0.72],["Rudy Tomjanovich",13.01,4.98,1.71,0.45,0.15],["Sleepy Floyd",13.74,3.62,7.6,1.37,0.14],["Steve Harris",6.57,1.71,1.18,0.47,0.15],["Terry Teagle",7.8,1.93,1.52,0.46,0.15],["Tim McCormick",5.2,3.2,0.7,0.2,0.3],["Tom Henderson",5.6,1.64,4,0.75,0.08],["Wally Walker",7.42,3.3,1.78,0.42,0.22],["Walter Berry",8.8,3.8,1.4,0.5,0.9],["World B. Free",6.4,0.8,1,0.3,0.1]]],
    ["HOU","1990s",[["Adrian Caldwell",1.77,2.18,0.14,0.32,0.29],["Anthony Bowie",4.3,1.8,1.5,0.6,0.1],["Anthony Miller",2.4,2.3,0.2,0.2,0.2],["Avery Johnson",5.1,0.9,3.4,0.8,0.1],["Brent Price",5.99,1.59,2.71,0.73,0.05],["Bryce Drew",3.5,0.9,1.5,0.4,0.1],["Buck Johnson",12.32,4.33,2.35,1.1,0.67],["Byron Dinkins",3.5,1.2,2.3,0.6,0.1],["Carl Herrera",6.02,4.3,0.66,0.53,0.45],["Charles Barkley",16.73,12.44,4.05,1.1,0.41],["Charles Jones",0.41,1.38,0.26,0.08,0.41],["Chucky Brown",7.77,5.13,0.97,0.5,0.43],["Clyde Drexler",18.98,6.09,5.45,1.88,0.59],["Cuttino Mobley",9.9,2.3,2.5,0.9,0.5],["Dave Feitl",2.6,1.9,0.2,0.1,0.2],["Dave Jamerson",3.61,0.86,0.7,0.31,0],["David Wood",5.3,3,1.1,0.7,0.2],["Derrick Chievous",6,1.8,0.7,0.6,0.1],["Eddie Johnson",9,2.46,1.24,0.39,0],["Eldridge Recasner",6.9,2.3,2.7,0.4,0.1],["Emanual Davis",4.3,1.16,1.46,0.47,0.12],["Eric Riley",1.9,1.3,0.2,0.1,0.2],["Hakeem Olajuwon",23.92,11.62,3.01,1.78,3.46],["John Lucas",5.8,1.8,4.9,0.9,0],["John Turner",2.8,1.9,0.3,0.1,0.1],["Kennard Winchester",3.58,1.07,0.35,0.29,0.23],["Kenny Smith",12.62,1.91,5.24,1.02,0.09],["Kevin Willis",13.74,7.97,0.95,0.65,0.45],["Larry Smith",2.96,7.1,0.94,0.81,0.31],["Mario Elie",9.77,2.66,3.09,0.96,0.14],["Mark Bryant",8.6,4.9,0.7,0.4,0.3],["Matt Bullard",5.38,2.01,0.93,0.33,0.22],["Matt Maloney",8.36,1.8,3.1,0.85,0.04],["Michael Dickerson",10.9,1.7,1.9,0.5,0.2],["Mike Woodson",6.24,1.34,1.07,0.67,0.23],["Mitchell Wiggins",15.5,4.3,1.6,1.3,0],["Othella Harrington",6.56,4.19,0.36,0.17,0.49],["Otis Thorpe",15.61,9.69,2.59,0.73,0.33],["Pete Chilcutt",3.95,3.35,0.69,0.35,0.39],["Randy Livingston",3.9,1.5,2.4,0.6,0.2],["Robert Horry",10.52,5.32,3.14,1.39,1.16],["Rodrick Rhodes",5.66,1.2,1.82,1.06,0.19],["Sam Cassell",10.08,2.56,4.18,0.98,0.14],["Sam Mack",7.93,2.28,1.55,0.63,0.16],["Scott Brooks",5.42,1.17,2.26,0.77,0],["Scottie Pippen",14.5,6.5,5.9,2,0.7],["Sedale Threatt",3.3,1.1,1.9,0.7,0.1],["Sleepy Floyd",10.4,1.98,4.32,0.93,0.18],["Tim Breaux",3,0.97,0.4,0.24,0.1],["Tracy Moore",5.46,1.41,0.72,0.22,0],["Tracy Murray",3.5,0.9,0.2,0.3,0.1],["Tree Rollins",1.46,2.28,0.26,0.16,0.81],["Vernon Maxwell",14.92,2.94,4.32,1.39,0.24],["Winston Garland",5.9,1.6,2.1,0.6,0.1],["Žan Tabak",2,1.5,0.1,0.1,0.2]]],
    ["HOU","2000s",[["Aaron Brooks",8.86,1.65,2.49,0.48,0.1],["Andre Barrett",2.1,0.7,1.6,0.5,0],["Anthony Miller",3.6,4.57,0.49,0.29,0.29],["Bob Sura",10.3,5.5,5.2,1.1,0.1],["Bobby Jackson",8.8,2.7,2.4,0.5,0.1],["Bonzi Wells",8.7,4.82,1.42,0.96,0.5],["Boštjan Nachbar",2.91,1.51,0.59,0.22,0.2],["Brent Barry",3.7,1.7,1.4,0.4,0.1],["Bryce Drew",5.8,1.4,2.3,0.6,0],["Carl Landry",8.78,4.96,0.56,0.4,0.32],["Carlos Rogers",6.56,4.52,0.55,0.3,0.56],["Charles Barkley",14.5,10.5,3.2,0.7,0.2],["Chuck Hayes",3.41,5.14,0.75,0.82,0.34],["Clarence Weatherspoon",4.3,3.63,0.45,0.39,0.3],["Cuttino Mobley",18,4.28,2.72,1.26,0.42],["Dan Langhi",2.9,1.61,0.25,0.2,0.05],["David Wesley",10.33,2.54,2.9,0.93,0.1],["Derek Anderson",10.8,4.2,2.7,0.8,0.2],["Dikembe Mutombo",3.19,5.43,0.12,0.26,1.1],["Eddie Griffin",8.7,5.85,0.91,0.46,1.59],["Eric Piatkowski",4.1,1.5,0.5,0.3,0.1],["Glen Rice",8.9,2.48,1.15,0.45,0.12],["Hakeem Olajuwon",11.21,6.88,1.29,1.07,1.54],["James Posey",9.3,4.8,1.8,1.3,0.2],["Jason Collier",3.49,2.42,0.3,0.16,0.14],["Jim Jackson",12.99,5.8,2.98,1.08,0.23],["John Lucas III",3.08,0.71,0.74,0.4,0],["Jon Barry",6.26,2.33,2.24,0.85,0.1],["Juaquin Hawkins",2.3,1.3,0.8,0.5,0.1],["Juwan Howard",10.43,6.13,1.5,0.5,0.1],["Keith Bogans",8.5,4.5,2.5,1,0.2],["Kelvin Cato",6.23,6.17,0.5,0.55,1.38],["Kenny Thomas",9.82,6.34,1.54,0.83,0.57],["Kevin Willis",6.1,5.8,0.3,0.5,0.4],["Kirk Snyder",4.69,1.95,0.98,0.26,0.26],["Kyle Lowry",7.6,2.8,3.5,0.8,0.3],["Lonny Baxter",3.6,3.7,0.1,0.4,0.3],["Luis Scola",11.5,7.6,1.4,0.75,0.15],["Luther Head",8.77,2.66,2.28,0.86,0.09],["Mark Jackson",2.5,1.7,2.8,0.4,0],["Matt Bullard",6.28,2.29,0.89,0.25,0.15],["Maurice Taylor",10.52,4.69,1.32,0.43,0.47],["Metta World Peace",17.1,5.2,3.3,1.5,0.3],["Mike James",9.15,2.32,2.18,0.68,0.1],["Mike Wilks",1.9,0.6,0.7,0.1,0],["Moochie Norris",5.65,2.16,3.11,0.76,0.01],["Rafer Alston",12.64,3.5,5.68,1.44,0.15],["Rick Brunson",1.9,0.9,1.4,0.3,0],["Ryan Bowen",1.5,1.25,0.35,0.3,0.1],["Scott Padgett",3.5,2.5,0.56,0.33,0.18],["Shandon Anderson",10.5,4.4,2.6,1.1,0.45],["Shane Battier",9.05,4.65,2.08,0.95,0.9],["Steve Francis",18.95,6.04,6.29,1.61,0.42],["Steve Novak",2.7,0.85,0.2,0.1,0.05],["Stromile Swift",8.9,4.4,0.4,0.6,0.8],["Terence Morris",3.76,2.89,0.73,0.26,0.36],["Thomas Hamilton",3.7,4.1,0.7,0.2,0.6],["Tierre Brown",3.1,1.1,1.8,0.5,0.1],["Tracy McGrady",23.13,5.58,5.71,1.33,0.6],["Tyronn Lue",6,1.9,2.8,0.4,0],["Vassilis Spanoulis",2.7,0.7,0.9,0.2,0],["Von Wafer",9.7,1.8,1.1,0.6,0.1],["Walt Williams",9.58,3.63,1.63,0.48,0.43],["Yao Ming",19.14,9.3,1.61,0.41,1.89],["Óscar Torres",6,1.9,0.6,0.4,0.1]]],
    ["HOU","2010s",[["Aaron Brooks",13.93,1.97,3.93,0.68,0.16],["Austin Rivers",8.7,1.9,2.3,0.6,0.3],["Bobby Brown",2.5,0.29,0.6,0.09,0],["Brad Miller",6.4,3.7,2.4,0.5,0.4],["Carl Landry",16.1,5.5,0.8,0.5,0.9],["Carlos Delfino",10.6,3.3,2,1,0.1],["Chandler Parsons",14.11,5.22,3.26,1.13,0.43],["Chase Budinger",9.43,3.42,1.38,0.5,0.14],["Chris Paul",17.1,5,8.05,1.85,0.25],["Chuck Hayes",6.01,6.8,2.16,0.98,0.59],["Clint Capela",11.97,9.17,0.93,0.68,1.43],["Cole Aldrich",1.7,1.9,0.2,0.1,0.3],["Corey Brewer",7.66,2.62,1.36,0.91,0.23],["Courtney Lee",9.59,2.64,1.33,0.91,0.28],["Danuel House Jr.",9.4,3.6,1,0.5,0.3],["David Andersen",5.8,3.3,0.7,0.2,0.2],["Donatas Motiejūnas",7.82,3.93,1.08,0.48,0.31],["Dwight Howard",15.96,11.66,1.51,0.86,1.61],["Eric Gordon",16.79,2.47,2.21,0.6,0.44],["Francisco García",5.44,1.85,1.1,0.58,0.53],["Gary Clark",2.9,2.3,0.4,0.4,0.5],["Gerald Green",10.24,2.75,0.54,0.54,0.4],["Goran Dragić",10.7,2.5,4.6,1.12,0.2],["Greg Smith",5.31,4.15,0.32,0.28,0.55],["Iman Shumpert",4.6,2.7,1.1,0.6,0.2],["Isaiah Canaan",5.34,1.2,1.08,0.5,0.09],["Isaiah Hartenstein",1.9,1.7,0.5,0.3,0.4],["Ish Smith",2.6,1.5,2.3,0.5,0.1],["James Anderson",4,2,1.1,0.4,0.1],["James Ennis III",7.4,2.9,0.7,1,0.4],["James Harden",29.05,5.96,7.72,1.76,0.59],["Jared Jeffries",3.2,2.75,0.8,0.45,0.45],["Jason Terry",6.47,1.36,1.66,0.8,0.15],["Jeremy Lin",12.98,2.81,5.17,1.32,0.4],["Jermaine Taylor",4.26,1.42,0.46,0.3,0.14],["Joe Johnson",6,2.8,1.7,0.3,0],["Joey Dorsey",2.6,3.96,0.39,0.57,0.37],["Jordan Hamilton",6.6,2.9,0.9,0.6,0.3],["Jordan Hill",5.59,4.55,0.44,0.23,0.66],["Josh Smith",10.41,5.09,2.45,0.84,1.02],["K.J. McDaniels",2.38,0.98,0.21,0.17,0.24],["Kenneth Faried",12.9,8.2,0.7,0.6,0.8],["Kevin Martin",21.36,3.01,2.55,0.92,0.16],["Kostas Papanikolaou",4.2,2.7,2,0.7,0.3],["Kyle Lowry",12.12,4.02,5.89,1.27,0.23],["Lou Williams",14.9,3,2.4,0.7,0.4],["Luc Mbah a Moute",7.5,3,0.9,1.2,0.4],["Luis Scola",16.69,7.84,2.23,0.64,0.43],["Marcus Morris",7.12,3.33,0.73,0.4,0.25],["Marcus Thornton",10,2.4,1.4,0.7,0.1],["Michael Beasley",12.8,4.9,0.8,0.6,0.5],["Montrezl Harrell",6.89,2.96,0.82,0.3,0.54],["Nenê",6.83,3.6,0.86,0.6,0.45],["Omri Casspi",6.9,3.7,1.2,0.6,0.2],["P.J. Tucker",6.7,5.7,1.05,1.3,0.4],["Pablo Prigioni",3,1.6,2.8,1.1,0],["Patrick Beverley",9.3,4.07,3.38,1.27,0.41],["Patrick Patterson",8.38,4.33,0.89,0.37,0.63],["Ronnie Brewer",0.3,0.6,0.4,0.3,0],["Ryan Anderson",11.54,4.79,0.9,0.4,0.25],["Sam Dekker",6.26,3.57,0.96,0.49,0.29],["Samuel Dalembert",7.5,7,0.5,0.6,1.7],["Shane Battier",8.28,4.75,2.49,0.85,1.15],["Tarik Black",3.73,3.82,0.3,0.33,0.44],["Terrence Jones",10.26,5.69,0.97,0.59,1.21],["Terrence Williams",4.02,1.87,0.7,0.35,0.05],["Toney Douglas",8.1,1.8,1.9,0.8,0],["Trevor Ariza",12.75,5.18,2.48,1.81,0.32],["Troy Daniels",4,0.49,0.38,0,0],["Ty Lawson",5.8,1.7,3.4,0.8,0.1],["Tyler Ennis",1.9,0.6,1.1,0.2,0],["Ömer Aşık",8.51,10.3,0.75,0.49,0.99]]],
    ["HOU","2020s",[["Kevin Durant",26,5.5,4.8,0.8,0.9],["Jeff Green",4.7,1.6,0.6,0.2,0.2],["Eric Gordon",15.6,2,2.7,0.5,0.4],["D.J. Augustin",7.7,1.6,3.3,0.5,0],["John Wall",20.6,3.2,6.9,1.1,0.8],["Avery Bradley",6.4,2.1,1.7,0.8,0.1],["Dennis Schröder",13.5,3.3,4.6,0.8,0.1],["Kelly Olynyk",13.5,7,2.9,1.1,0.6],["Reggie Bullock Jr.",2.2,1.7,0.3,0.3,0.1],["Steven Adams",4.8,7.1,1.3,0.6,0.6],["Dante Exum",3.8,2.8,2.2,0.7,0.3],["Clint Capela",3.8,4.6,0.7,0.5,0.8],["Bruno Caboclo",2.8,2.3,0.2,0,0.3],["Frank Kaminsky",2.5,1.4,0.9,0.2,0.1],["Christian Wood",19.4,9.8,2,0.8,1.1],["Boban Marjanovic",3.2,2.1,0.3,0.2,0.1],["Dorian Finney-Smith",3.3,2.5,1,0.4,0.2],["Fred VanVleet",15.8,3.8,6.8,1.5,0.6],["Danuel House Jr.",8.8,3.7,1.9,0.6,0.4],["David Nwaba",7.1,3.6,0.9,0.8,0.6],["Justin Patton",5.4,3.8,1.1,0.9,1.1],["D.J. Wilson",5.2,3.2,0.7,0.3,0.5],["Dillon Brooks",13.3,3.5,1.7,0.9,0.2],["Cameron Oliver",10.8,5.3,1.3,0.5,1],["Sterling Brown",8.2,4.4,1.4,0.7,0.2],["Bruno Fernando",2.9,1.8,0.2,0,0.4],["Aaron Holiday",5.9,1.3,1.4,0.4,0.1],["Josh Okogie",4.5,2.6,0.9,0.8,0.2],["Khyri Thomas",16.4,3.6,5,1.8,1.2],["Ray Spalding",2,2,0,0,1],["Jack McVeigh",1.6,0.6,0.1,0,0.2],["Jock Landale",4.8,3.2,1.1,0.3,0.4],["Cam Reynolds",3,1,0.4,0,0],["Kevin Porter Jr.",17.1,4.5,6.1,1.1,0.3],["Armoni Brooks",11.2,3.4,1.5,0.6,0.3],["Garrison Mathews",10,2.9,1,0.9,0.4],["Nate Hinton",2.2,1.5,0.7,0.2,0.1],["Jalen Green",20,4.2,3.3,0.8,0.3],["Daishen Nix",3.6,1.5,2,0.6,0.1],["KJ Martin",10.3,4.9,1.3,0.5,0.6],["Anthony Lamb",2.8,1.7,1,0.1,0.1],["Trevelin Queen",4.3,1.6,0.4,0.5,0.1],["Jae'Sean Tate",7.1,3.6,1.7,0.7,0.3],["Josh Christopher",6.8,1.8,1.6,0.7,0.2],["Alperen Sengun",17,8.6,4.5,1,0.9],["Usman Garuba",2.5,3.8,0.8,0.5,0.5],["Darius Days",3.8,1.5,0.3,0,0.3],["Jabari Smith Jr.",13.6,7.3,1.5,0.6,0.8],["TyTy Washington Jr.",4.7,1.5,1.5,0.5,0.1],["Tari Eason",10.4,6.4,1.3,1.4,0.7],["JD Davison",2.5,1.2,1.3,0.2,0.2],["David Roddy",4.6,2.5,1.1,0.4,0.3],["Jermaine Samuels Jr.",1.4,0.9,0.2,0.1,0.1],["Trevor Hudgins",1.8,0,0.6,0,0],["Nate Williams",3.1,0.8,0.4,0.3,0.1],["Amen Thompson",14,7.5,3.9,1.4,0.8],["Cam Whitmore",10.9,3.4,0.8,0.6,0.3],["Tristen Newton",12,3,0,1,0],["Reed Sheppard",8.9,2.2,2.4,1.1,0.5],["N'Faly Dante",6,5.3,0.5,0.3,1.3],["Isaiah Crawford",2,1.1,0.4,0.1,0.2]]],
    ["IND","1970s",[["Adrian Dantley",26.5,9.4,2.8,2.1,0.7],["Alex English",16,8.1,3.3,0.9,1],["Billy Knight",22.63,6.5,2.93,1.27,0.17],["Bob Carrington",7.1,1.8,1.8,0.6,0.3],["Brad Davis",2.7,0.7,2,0.6,0.1],["Corky Calhoun",4.7,2.9,1.3,0.5,0.2],["Dan Roundfield",13.62,9.46,1.89,1,1.99],["Darnell Hillman",10.7,8.5,2,1.2,1.3],["Dave Robisch",11.14,7.03,2.02,0.74,0.54],["Don Buse",8,3.3,8.5,3.5,0.2],["Earl Tatum",14.4,3.6,4,1.8,0.5],["Freddie Lewis",7,1.5,1.8,0.6,0.1],["James Edwards",16.16,8.09,1.06,0.66,1.13],["Jerome Anderson",2.4,0.4,0.4,0.2,0.1],["John Williamson",19.77,2.73,3.35,1.31,0.08],["Johnny Davis",18.3,2.4,5.7,1.2,0.3],["Johnny Neumann",4.2,0.7,1.4,0.3,0.1],["Kevin Stacom",4.2,1.4,1.8,0.3,0],["Len Elmore",4.69,5.39,1.01,0.9,0.99],["Mel Bennett",3.97,3.34,0.91,0.54,0.41],["Mike Bantom",15,7.7,2.85,1.2,0.7],["Mike Flynn",6.23,2.11,2.25,0.7,0.1],["Rick Robey",8.6,5.9,1.2,0.6,0.3],["Ricky Sobers",17.74,3.9,6.49,1.95,0.3],["Ron Behagen",11.2,6.5,1.3,0.6,0.4],["Steve Green",4.59,1.94,0.65,0.48,0.12],["Wayne Radford",3.9,1.3,1.1,0.6,0],["Wil Jones",13,7.6,2.4,1.3,1]]],
    ["IND","1980s",[["Alex English",14.9,7,2.6,0.8,0.6],["Anthony Frederick",3.3,1.1,0.4,0.3,0.1],["Bill Garnett",5.24,3.85,1.11,0.46,0.26],["Bill Martin",5,1.5,0.8,0.3,0.1],["Billy Knight",15.04,4.27,1.97,0.92,0.13],["Brad Branson",5.5,2.8,0.7,0.4,0.4],["Brook Steppe",7,2,1.3,0.6,0.1],["Bryan Warrick",7,2.1,3.5,0.8,0.1],["Butch Carter",9.92,1.7,2,1.09,0.17],["Chuck Person",19.14,7.21,3.7,1,0.17],["Clark Kellogg",18.94,9.54,2.97,1.44,0.4],["Clemon Johnson",7.94,6.05,1.75,0.7,1.42],["Clint Richardson",8.09,2.47,3.82,0.65,0.1],["Clinton Wheeler",2.5,0.7,1.7,0.6,0],["Detlef Schrempf",14.8,7.2,2.9,0.9,0.3],["Devin Durrant",5.1,2.1,1.4,0.3,0.2],["Don Buse",7.79,2.16,3.92,1.71,0.22],["Dudley Bradley",8.2,2.55,2.7,2.45,0.55],["Dwayne McClain",3.5,0.7,1.5,0.8,0.1],["Everette Stephens",1.9,0.7,1.1,0.3,0.1],["George Johnson",10.42,5.66,2.05,0.9,0.54],["George McGinnis",9.43,6.73,3.03,1.31,0.37],["Granville Waiters",3.42,2.81,0.67,0.3,0.92],["Greg Dreiling",2.11,1.56,0.3,0.1,0.18],["Herb Williams",14.98,7.8,2.44,0.68,1.91],["James Edwards",15.65,7,2.05,0.55,1.45],["Jerry Sichting",8.35,1.64,4.13,0.9,0.05],["Jim Thomas",8.83,2.73,2.38,0.91,0.1],["Joe Hassett",7.1,1.3,1.4,0.6,0.1],["John Duren",4.5,1.3,2.4,0.8,0.1],["John Kuester",1.2,0.6,0.7,0.3,0],["John Long",12.56,2.48,2.4,1.01,0.08],["Johnny Davis",15.8,2.41,5.28,1.16,0.2],["Jose Slaughter",3.6,1.1,0.8,0.6,0.1],["Kevin McKenna",6.3,1.6,1.9,0.8,0.1],["Kyle Macy",4.9,1.5,2.6,0.8,0.1],["LaSalle Thompson",12.5,9.9,1.1,1,1.2],["Leroy Combs",4.5,1.2,0.8,0.5,0.4],["Louis Orr",10.99,4.25,1.65,0.7,0.3],["Marty Byrnes",4.9,2.4,2.2,0.5,0.1],["Mickey Johnson",19.1,8.3,4.2,1.9,1.4],["Mike Bantom",12.65,5.7,3.06,1.08,0.8],["Phil Chenier",5.4,1.5,2,0.7,0.4],["Quinn Buckner",3.7,1.6,2.7,1.3,0.1],["Randy Wittman",5.2,1.6,2.4,0.4,0.1],["Reggie Miller",12.85,3.06,2.31,0.93,0.29],["Rik Smits",11.7,6.1,0.9,0.5,1.8],["Ron Anderson",7.76,3.11,1.4,0.66,0.07],["Russ Schoene",7.8,3.3,0.9,0.4,0.5],["Scott Skiles",5.87,1.67,4.35,0.64,0.04],["Sidney Lowe",4.2,1.6,3.4,1.2,0.1],["Steve Stipanovich",13.2,7.78,2.32,1.02,0.96],["Stuart Gray",2.43,2.71,0.41,0.16,0.34],["Terence Stansbury",6.9,1.7,2.25,0.7,0.15],["Tom Abernethy",2,1.4,0.6,0.2,0.1],["Tom Owens",10.5,5,1.7,0.6,0.5],["Tony Brown",6.6,3.5,1.9,0.7,0.1],["Vern Fleming",13.69,4.32,5.75,1.3,0.14],["Walker Russell",3.3,1.1,2.7,0.4,0.1],["Wayman Tisdale",15.24,6.45,1.29,0.59,0.45]]],
    ["IND","1990s",[["Adrian Caldwell",2.2,2.2,0.1,0.2,0.1],["Al Harrington",2.1,1.9,0.2,0.2,0.1],["Antonio Davis",9.02,6.63,0.67,0.48,0.9],["Austin Croshere",3.15,1.7,0.35,0.3,0.25],["Byron Scott",10.18,1.76,1.67,0.85,0.15],["Chris Mullin",10.85,3.08,2.03,1.09,0.42],["Chuck Person",18.85,5.43,3.58,0.73,0.23],["Dale Davis",9.34,8.84,0.84,0.71,1.36],["Derrick McKey",10.47,4.69,3.12,1.23,0.57],["Detlef Schrempf",17.19,8.76,4.21,0.83,0.33],["Duane Ferrell",4.8,1.88,0.78,0.5,0.1],["Dwayne Schintzius",3.4,2.4,0.4,0.3,0.4],["Eddie Johnson",6.95,2.16,0.94,0.27,0.07],["Erick Dampier",5.1,4.1,0.6,0.3,1],["Fred Hoiberg",3.86,1.61,0.71,0.53,0.04],["George McCloud",5.5,2.02,2.04,0.55,0.12],["Greg Dreiling",2.16,2.24,0.42,0.19,0.31],["Haywoode Workman",5.07,2.06,3.83,0.98,0.1],["Jalen Rose",9.12,2.37,2.03,0.84,0.26],["Jerome Allen",3.2,1.3,2.1,0.5,0],["John Williams",2.9,1.8,0.8,0.3,0.1],["Kenny Williams",4.79,2.66,0.64,0.29,0.64],["LaSalle Thompson",5.19,5.02,1.11,0.64,0.57],["Malik Sealy",6.08,2.24,0.93,0.64,0.14],["Mark Jackson",8.51,3.83,8.15,1.16,0.1],["Mark Pope",1.29,0.91,0.26,0.09,0.18],["Micheal Williams",13.13,3.02,6.57,2.52,0.25],["Mike Sanders",5.81,2.45,1.19,0.48,0.29],["Pooh Richardson",10.27,3.4,7.27,1.17,0.17],["Randy Wittman",1.74,0.58,0.58,0.13,0.08],["Reggie Miller",21.03,3.14,3.23,1.19,0.23],["Rickey Green",3.5,0.8,2.6,0.7,0],["Ricky Pierce",9.7,1.8,1.3,0.8,0.1],["Rik Smits",15.44,6.18,1.5,0.42,1.23],["Sam Mitchell",6.2,2.88,0.87,0.4,0.13],["Sam Perkins",5,2.9,0.5,0.3,0.3],["Sean Green",4.22,1.06,0.57,0.35,0.17],["Travis Best",6.96,1.54,3.23,0.91,0.1],["Vern Fleming",9.81,2.68,4.16,0.84,0.1],["Vincent Askew",5.7,2.4,2.2,0.4,0.1]]],
    ["IND","2000s",[["Al Harrington",11.15,5.58,1.44,0.83,0.31],["Andre Owens",4,1.5,1.5,0.4,0.1],["Anthony Johnson",7.92,2.24,3.93,0.86,0.2],["Austin Croshere",7.93,4.61,1.06,0.4,0.38],["Brad Miller",13.65,8.19,2.38,0.9,0.54],["Brandon Rush",8.1,3.1,0.9,0.5,0.5],["Bruno Šundov",2.3,1.37,0.13,0.13,0.2],["Carlos Rogers",2.7,1.7,0.1,0.2,0.3],["Chris Mullin",5.1,1.6,0.8,0.6,0.2],["Dale Davis",9.22,9.65,0.93,0.73,1.3],["Danny Granger",16.36,5.18,1.82,0.92,0.98],["Darrell Armstrong",5.6,1.7,2.4,0.9,0.1],["David Harrison",5.01,2.89,0.26,0.34,1],["Derrick McKey",2.89,3.19,1.1,0.77,0.27],["Eddie Gill",2.76,1.1,0.81,0.62,0.06],["Erick Strickland",6.5,2,2.9,0.5,0.1],["Fred Jones",7.71,2.24,2.14,0.76,0.28],["Ike Diogu",5.72,3.09,0.42,0.14,0.28],["Jalen Rose",19.09,4.84,4.62,0.95,0.57],["Jamaal Tinsley",10.42,3.43,7,1.65,0.3],["James Jones",4.63,2.15,0.74,0.39,0.37],["Jamison Brewer",1.62,0.76,1.22,0.31,0.03],["Jarrett Jack",13.1,3.4,4.1,1.1,0.2],["Jeff Foster",5.12,7.01,0.96,0.7,0.41],["Jermaine O'Neal",18.65,9.59,1.95,0.67,2.42],["John Edwards",1.2,0.8,0.1,0.1,0.2],["Jonathan Bender",5.62,2.24,0.63,0.15,0.63],["Josh McRoberts",2.4,2.2,0.5,0.4,0.5],["Kareem Rush",8.3,2.4,1.3,0.6,0.3],["Keith McLeod",4.2,1,2,0.3,0.1],["Kenny Anderson",6,1.8,2.8,0.6,0.1],["Kevin Ollie",5.4,1.9,3.4,0.9,0],["Maceo Baston",2.75,1.71,0.3,0.26,0.4],["Mark Jackson",8.1,3.7,8,0.9,0.1],["Marquis Daniels",9.6,3.14,1.81,0.97,0.29],["Metta World Peace",16.55,5.23,2.99,2.24,0.69],["Mike Dunleavy",17.06,5.17,3.09,0.99,0.35],["Orien Greene",1.5,1.1,0.5,0.4,0.1],["Peja Stojaković",19.5,6.3,1.7,0.7,0.2],["Primož Brezec",1.85,1.05,0.24,0.04,0.24],["Rasho Nesterović",6.8,3.4,1.6,0.4,0.5],["Rawle Marshall",2.5,0.7,0.3,0.3,0.1],["Reggie Miller",15.23,2.79,2.76,0.94,0.15],["Rik Smits",12.9,5.1,1.1,0.3,1.3],["Ron Mercer",7.26,2.05,1.48,0.62,0.2],["Ronald Murray",11,2,3.5,1.1,0.1],["Roy Hibbert",7.1,3.5,0.7,0.3,1.1],["Sam Perkins",5.36,3.16,0.71,0.44,0.36],["Scot Pollard",3.01,3.78,0.35,0.58,0.43],["Shawne Williams",5.54,2.33,0.73,0.28,0.32],["Stephen Graham",4.98,1.56,0.54,0.2,0.07],["Stephen Jackson",16.59,3.92,2.71,1.21,0.44],["T.J. Ford",14.9,3.5,5.3,1.2,0.2],["Travis Best",9.6,2.13,4.51,1.18,0.1],["Travis Diener",5.45,1.65,3.07,0.5,0.1],["Troy Murphy",12.76,8.72,2.14,0.72,0.48],["Tyus Edney",4.4,1,2.3,0.7,0],["Šarūnas Jasikevičius",7.33,1.77,3,0.47,0.07],["Žan Tabak",3.46,3.38,0.5,0.2,0.5]]],
    ["IND","2010s",[["A.J. Price",6.32,1.47,2.07,0.56,0.04],["Aaron Brooks",5,1.1,1.9,0.4,0.1],["Aaron Holiday",5.9,1.3,1.7,0.4,0.3],["Al Jefferson",7.71,4.13,0.86,0.34,0.34],["Alex Poythress",1,0.7,0.1,0.1,0],["Bojan Bogdanović",16.16,3.75,1.75,0.8,0.05],["Brandon Rush",9.27,3.75,1.18,0.66,0.67],["C.J. Miles",11.97,2.94,0.89,0.76,0.39],["C.J. Watson",8.22,2.22,2.6,1,0.15],["Chase Budinger",4.4,2.5,1,0.6,0.2],["Chris Copeland",5.07,1.57,0.73,0.15,0.2],["Cory Joseph",7.2,3.3,3.55,1.05,0.25],["D.J. Augustin",4.7,1.2,2.2,0.4,0],["Dahntay Jones",7.54,2.19,1.34,0.44,0.32],["Damjan Rudež",4.8,0.7,0.8,0.2,0.1],["Danny Granger",19.16,5.03,2.22,1.07,0.69],["Darren Collison",11.88,2.9,5.33,1.17,0.17],["David West",13.98,6.98,2.8,0.83,0.81],["Domantas Sabonis",12.85,8.5,2.45,0.55,0.4],["Donald Sloan",4.98,1.84,2.36,0.3,0],["Doug McDermott",7.3,1.4,0.9,0.2,0.1],["Earl Watson",7.8,3,5.1,1.3,0.2],["Edmond Sumner",2.86,1,0.38,0.48,0.19],["Evan Turner",7.1,3.2,2.4,0.4,0.1],["George Hill",12.32,3.73,3.91,1.02,0.28],["Georges Niang",0.9,0.7,0.2,0.1,0],["Gerald Green",7,2.4,0.8,0.3,0.4],["Glenn Robinson III",5.01,2.57,0.67,0.53,0.22],["Ian Mahinmi",5.51,4.93,0.64,0.6,0.9],["James Posey",4.9,3,0.7,0.5,0.1],["Jeff Ayres",3.13,2.41,0.33,0.2,0.23],["Jeff Foster",3.13,5.74,0.84,0.4,0.48],["Jeff Teague",15.3,4,7.8,1.2,0.4],["Joe Young",3.4,1.02,0.94,0.28,0],["Jordan Hill",8.8,6.2,1.2,0.5,0.5],["Josh McRoberts",6.26,4.45,1.69,0.59,0.65],["Kevin Séraphin",4.7,2.9,0.5,0.1,0.4],["Kyle O'Quinn",3.5,2.6,1.2,0.2,0.6],["Lance Stephenson",9.07,4.66,3.07,0.7,0.15],["Lavoy Allen",4.42,4.61,0.99,0.26,0.52],["Leandro Barbosa",8.9,2.2,1.5,0.9,0],["Lou Amundson",3.6,3.7,0.2,0.5,0.7],["Luis Scola",8.49,5.64,1.15,0.45,0.2],["Luther Head",7.6,1.7,1.5,0.4,0.2],["Mike Dunleavy",10.52,3.98,1.6,0.65,0.34],["Monta Ellis",11.27,3.06,3.98,1.52,0.45],["Myles Turner",12.86,6.68,1.25,0.7,2.04],["Orlando Johnson",3.32,1.82,0.69,0.2,0.11],["Paul George",18.05,6.3,3.16,1.65,0.44],["Rakeem Christmas",2.07,1.87,0.1,0.1,0.19],["Rasual Butler",2.7,0.8,0.3,0.1,0.2],["Rodney Stuckey",10.07,2.92,2.65,0.67,0.08],["Roy Hibbert",11.73,7.28,1.55,0.4,1.97],["Sam Young",2.8,2.2,0.8,0.3,0.1],["Solomon Hill",6.07,3.07,1.48,0.63,0.18],["Solomon Jones",3.83,2.84,0.69,0.3,0.66],["T.J. Ford",8.02,2.64,3.61,0.9,0.2],["T.J. Leaf",3.42,1.87,0.3,0.15,0.2],["Thaddeus Young",11.82,6.31,2.01,1.57,0.4],["Troy Murphy",14.6,10.2,2.1,1,0.5],["Tyler Hansbrough",8.93,4.74,0.55,0.56,0.18],["Tyreke Evans",10.2,2.9,2.4,0.8,0.3],["Victor Oladipo",21.71,5.33,4.59,2.17,0.64],["Wesley Matthews",10.9,2.8,2.4,0.9,0.2]]],
    ["IND","2020s",[["George Hill",5,1.8,2.4,0.6,0.1],["Ricky Rubio",13.1,4.1,6.6,1.4,0.2],["James Johnson",1.5,0.9,0.7,0.3,0.2],["Lance Stephenson",8.3,2.8,3.6,0.5,0.1],["Jeremy Lamb",10.1,3.6,1.5,0.9,0.6],["Justin Holiday",10.5,3.6,1.7,1,0.6],["Doug McDermott",9.6,2.1,1.2,0.3,0.1],["T.J. Warren",15.5,3.5,1.3,0.5,0],["JaKarr Sampson",4.6,2.7,0.1,0.1,0.5],["T.J. McConnell",9.1,2.9,5.3,1.2,0.2],["Jahlil Okafor",0,1,1,0,0],["Justin Anderson",6.4,2.9,2.1,0.5,0.4],["Myles Turner",15.2,6.9,1.2,0.7,2.5],["Keifer Sykes",5.6,1.4,1.9,0.4,0.1],["Domantas Sabonis",20.3,12,6.7,1.2,0.5],["Buddy Hield",16.2,4.7,2.8,1.1,0.3],["Caris LeVert",20.2,4.6,5.2,1.4,0.6],["Malcolm Brogdon",20.1,5.2,5.9,0.9,0.3],["Pascal Siakam",22,6.9,3.8,0.9,0.4],["Ivica Zubac",14.1,10.6,2.2,0.4,0.8],["Gabe York",6,1.5,1.9,0.8,0.2],["Tony Bradley",4.4,3,0.4,0.1,0.6],["Edmond Sumner",7.5,1.8,0.9,0.6,0.2],["Thomas Bryant",6.5,3.8,0.8,0.4,0.6],["Monte Morris",3,1.2,1.5,0.2,0.2],["Daniel Theis",7,3.1,1.3,0.3,0.9],["Amida Brimah",2.6,1.6,0.2,0,1],["Brian Bowen II",0.5,0.5,0,0,0],["Aaron Holiday",7.2,1.3,1.9,0.7,0.2],["Cody Martin",1.8,3.5,0.5,1,0.5],["Goga Bitadze",6,3.4,1,0.3,1.1],["Oshae Brissett",8.7,4.7,0.9,0.7,0.5],["Kelan Martin",4.5,2.2,0.5,0.3,0.3],["Andrew Nembhard",11.4,2.7,5.3,1,0.2],["Jalen Lecque",1.3,1.3,0.5,0,0],["Jordan Nwora",8.7,3.7,1.4,0.4,0.2],["Garrison Mathews",5.2,1.1,0.7,0.4,0.2],["Ahmad Caver",2,0,0,0,0],["James Wiseman",4.7,1.5,0.4,0,0.1],["Obi Toppin",10.8,4.1,1.8,0.6,0.3],["Tyrese Haliburton",18.7,3.8,9.7,1.5,0.6],["Aaron Nesmith",12,4,1.5,0.8,0.5],["Jalen Smith",9.5,5.8,0.8,0.3,0.8],["Cassius Stanley",1.5,0.8,0,0,0.1],["Nate Hinton",0,0,0,0,0],["Chris Duarte",10.5,3.3,1.8,0.8,0.2],["Isaiah Jackson",7.2,4.5,0.7,0.6,1.4],["DeJon Jarreau",0,0,0,0,0],["Duane Washington Jr.",9.9,1.7,1.8,0.5,0.1],["Jay Huff",9.5,4,1.5,0.5,1.9],["Terry Taylor",9.6,5.2,1.2,0.4,0.2],["Ethan Thompson",7,2.2,1.8,0.6,0.3],["Micah Potter",9.7,5,1.5,0.5,0.3],["Bennedict Mathurin",15.8,4.5,1.8,0.6,0.2],["Kendall Brown",1.4,0.7,0.4,0.3,0],["Oscar Tshiebwe",3.3,2,0.3,0.3,0.1],["Isaiah Wong",2,0,0,0,0],["Quenton Jackson",5.2,1.7,1.8,0.6,0.1],["Cole Swider",5.9,2.7,0.3,0.4,0.2],["Jarace Walker",7.1,3.4,1.7,0.7,0.3],["Kobe Brown",5.8,3,1.3,0.4,0.2],["Ben Sheppard",5.6,2.5,1.3,0.6,0.1],["Jalen Slawson",7.3,4.4,2.8,1.5,1.1],["Johnny Furphy",3.6,2.9,0.8,0.5,0.2],["Enrique Freeman",2.1,1.4,0.4,0.1,0.1],["RayJ Dennis",2.7,1.1,1.3,0.6,0.2],["Kam Jones",4.4,1.6,3.2,0.5,0],["Taelon Peter",4.5,1.6,1.1,0.7,0.1]]],
    ["LAC","1970s",[["Adrian Dantley",20.3,7.6,1.9,1.2,0.2],["Bill Hewitt",4.7,5,1.5,null,null],["Bill Hosket",5.71,3.48,1.04,null,null],["Bill Willoughby",6.7,3.9,0.7,0.4,0.8],["Billy Knight",22.9,7.2,3,1.5,0.2],["Bird Averitt",8.4,1.16,2.42,0.46,0.13],["Bob Bigelow",2.9,1.6,0.9,0.4,0.1],["Bob Kauffman",15.83,9.15,3.87,0.5,0.2],["Bob McAdoo",28.24,12.67,2.59,1.14,2.42],["Bob Weiss",3.31,1.21,2.89,0.91,0.25],["Brian Taylor",3.8,1.3,1,1.2,0],["Chuck Williams",5.61,1.75,3.44,0.62,0.1],["Claude Terry",3.5,0.8,1,0.3,0],["Connie Norman",7.3,1.5,1.1,0.5,0.1],["Cornell Warner",6.04,6.48,0.87,null,null],["Dale Schlueter",3.02,3.36,1.26,0.2,0.41],["Dave Wohl",6.77,1.22,3.97,0.8,0],["Dick Garrett",11.22,3.23,2.87,null,null],["Dick Gibbs",4.7,1.5,0.7,0.2,0.2],["Don Adams",5.53,3.87,1.65,0.79,0.16],["Don May",20.2,7.5,2,null,null],["Elmore Smith",17.79,13.82,1.94,null,null],["Em Bryant",7.92,3.09,4.37,null,null],["Ernie DiGregorio",10.73,2.17,5.63,0.66,0.03],["Fred Foster",3.9,1.3,0.8,0.3,0],["Fred Hilton",9.44,2.16,1.6,null,null],["Freeman Williams",10.4,1.4,1.2,0.6,0],["Gar Heard",12.52,10.71,2.48,1.57,2.03],["George Johnson",7.6,10.3,2,0.6,2.7],["George Wilson",5.2,5,1,null,null],["Gus Gerard",5.59,2.61,0.98,0.52,0.7],["Herm Gilliam",11.2,4.2,3.6,null,null],["Howard Komives",6.1,1.8,3.6,null,null],["Jack Marin",11.89,4.38,1.65,0.67,0.34],["Jerome Whitehead",1.2,1.6,0.2,0.1,0.1],["Jerry Chambers",6.8,2.6,0.9,null,null],["Jim McDaniels",5.6,4.3,1,0.1,0.9],["Jim McMillian",16.43,6.35,2.83,1.32,0.24],["Jim Price",5.3,1.7,1.9,1.3,0.3],["Jim Washington",4.1,4.61,1,0.29,0.29],["John Gianelli",7,5.2,1,0.4,1.2],["John Hummer",8.56,6.31,1.84,null,null],["John Olive",1.3,0.6,0.1,0.1,0],["John Shumate",13.96,9.23,2.23,1.14,0.88],["Ken Charles",7.53,2.05,1.96,1.09,0.38],["Kermit Washington",11.3,9.8,1.5,1,1.5],["Kevin Kunnert",5.3,5.6,1.14,0.44,1.21],["Larry McNeill",11.9,5.1,1.2,0.5,0.3],["Lee Winfield",4.63,1.66,1.76,0.53,0.3],["Marvin Barnes",11.8,7.3,2.4,1.2,1.5],["Matt Guokas",4.9,1.5,2.6,0.7,0.2],["Mike Davis",10.34,2.28,1.73,null,null],["Mike Glenn",7.9,1.4,1.4,0.6,0.1],["Mike Macaluso",1.6,0.8,0.1,0.2,0],["Mike Silliman",2.5,1.7,0.6,null,null],["Nate Bowman",3.1,3.9,0.9,null,null],["Nick Weatherspoon",13.8,5.5,1.6,1,0.5],["Paul Long",4.5,1,0.8,null,null],["Paul Ruffner",1.76,0.81,0.16,0.1,0.1],["Randy Smith",18.69,4.46,5.09,2.08,0.05],["Scott Lloyd",2.94,1.98,0.55,0.2,0.18],["Sidney Wicks",9.8,5.1,1.6,0.9,0.5],["Swen Nater",13.08,11.04,2.3,0.5,0.5],["Ted McClain",5.2,1.8,3,1,0],["Tom McMillen",5.01,3.67,1.23,0.1,0.1],["Walt Hazzard",14.7,2.79,5.19,null,null],["Wil Jones",6.8,4.2,1.5,0.9,0.5],["World B. Free",28.8,3.9,4.4,1.4,0.4],["Zaid Abdul-Aziz",3.8,4.1,0.3,0.1,0.4]]],
    ["LAC","1980s",[["Al Wood",11.34,3.1,1.74,0.73,0.44],["Benoit Benjamin",13.04,8.13,1.84,0.77,2.83],["Bill Walton",11.85,9.06,2.89,0.78,2.28],["Billy McKinney",3.9,0.7,2,0.3,0],["Bingo Smith",11.7,3.5,1.3,0.8,0.2],["Bob Gross",3.1,2.4,1.3,0.8,0.3],["Brian Taylor",11.58,2.18,5.05,1.57,0.28],["Bryan Warrick",3.7,1,2.6,0.4,0.1],["Cedric Maxwell",13.94,7.88,3.02,0.77,0.37],["Charles Smith",16.3,6.5,1.5,1,1.3],["Charlie Criss",12.9,1.6,4,0.8,0.1],["Craig Hodges",8.85,1.35,2.55,0.95,0.05],["Danny Manning",16.7,6.6,3.1,1.7,1],["Darnell Valentine",8.37,2.03,5.24,1.46,0.12],["Derek Smith",17.27,4.18,2.15,0.78,0.62],["Earl Cureton",5.44,4.74,1.1,0.5,0.63],["Eric White",6.25,2.44,0.5,0.33,0.06],["Franklin Edwards",8.41,1.15,3.3,1.18,0.08],["Freeman Williams",18.5,1.85,1.96,0.93,0.08],["Gar Heard",4.8,4.5,1.6,1.3,0.9],["Gary Grant",11.9,3.4,7.1,2,0.1],["Grant Gondrezick",3.9,1.3,1.3,0.5,0],["Greg Kelser",11,4.9,1.1,0.9,0.4],["Greg Kite",3.21,4.4,0.74,0.4,1],["Hank McDowell",3.6,2.7,0.6,0.2,0],["Harvey Catchings",2.9,3.7,0.2,0.2,0.8],["Henry Bibby",4.6,1,2.7,0.6,0],["James Donaldson",11.44,8.11,0.85,0.4,1.69],["Jay Murphy",1.84,1.54,0.2,0.11,0.14],["Jerome Whitehead",8.14,5.83,0.78,0.43,0.34],["Jim Brogan",5.1,1.52,1.83,0.61,0.2],["Jim Smith",2.9,2.5,0.6,0.3,0.7],["Joe Bryant",10.88,5.2,2.19,1.07,0.43],["Joe Wolf",6.5,4.26,1.93,0.66,0.28],["John Douglas",6.76,1.35,2.21,0.76,0.1],["Junior Bridgeman",11.76,2.56,2.02,0.56,0.16],["Ken Norman",13.81,6.36,2.46,1.03,0.66],["Kenny Fields",8.52,3.41,1.4,0.7,0.3],["Kurt Nimphius",10.48,5.03,0.63,0.4,1.29],["Lancaster Gordon",5.59,1.29,1.47,0.65,0.17],["Larry Drew",11.24,1.64,5.29,0.94,0],["Lionel Hollins",13.5,2.3,6.7,2,0.3],["Lowes Moore",5.7,1.5,2,0.6,0],["Marques Johnson",18.28,5.54,3.55,1.2,0.55],["Martin Nessley",1.2,2.1,0.5,0.2,0.3],["Marvin Barnes",3.2,3.9,0.9,0.3,0.6],["Michael Brooks",13.71,6.6,2.71,1.3,0.44],["Michael Cage",11,8.72,1.2,0.95,0.6],["Michael Wiley",8.3,3,0.9,0.7,0.3],["Mike Woodson",17.57,2.3,3.02,1.4,0.25],["Nick Weatherspoon",6.9,3.6,0.9,0.6,0.3],["Norm Nixon",14.58,2.42,8.97,1.14,0],["Phil Smith",15.41,2.22,4.9,1.02,0.28],["Quintin Dailey",13.67,2.4,1.82,1.09,0.13],["Randy Smith",9.1,1.4,3,0.8,0],["Reggie Williams",10.27,3.01,1.64,1.12,0.54],["Richard Anderson",5.2,3.5,1.5,0.7,0.3],["Ricky Pierce",9.9,2,0.9,0.4,0.2],["Ron Davis",5.55,1.9,0.69,0.54,0.18],["Rory White",8.24,2.5,0.82,0.68,0.23],["Sidney Wicks",6.94,5.31,2.71,0.98,0.74],["Stan Pietkiewicz",4.18,0.82,1.73,0.45,0.09],["Steve Malovic",1.9,2.1,0.4,0.2,0],["Swen Nater",13.84,12.75,2.42,0.55,0.51],["Terry Cummings",23.27,10.06,2.07,1.42,0.79],["Tim Kempton",4.4,2.9,0.8,0.6,0.2],["Tom Chambers",17.4,6.75,2.1,0.85,0.65],["Tom Garrick",6.4,2.2,3.4,1.1,0.1],["World B. Free",30.2,3.5,4.2,1.2,0.5]]],
    ["LAC","1990s",[["Antonio Harvey",2.9,2.9,0.2,0.4,0.7],["Benoit Benjamin",14,10.26,2.09,0.76,2.49],["Bison Dele",15.8,7.6,1.9,1.1,0.8],["Bo Kimble",5.62,1.55,0.95,0.43,0.14],["Bo Outlaw",5.67,4.21,1.15,0.94,1.49],["Bob Martin",2.1,2.2,0.31,0.2,0.61],["Brent Barry",10.07,2.35,2.87,1.1,0.37],["Brian Skinner",4.1,2.5,0,0.5,0.6],["Charles Smith",16.33,5.95,1.36,0.94,1.54],["Danny Manning",19.3,6.41,3.03,1.46,1.09],["Danny Young",5.3,1.5,3.5,0.9,0.1],["Darrick Martin",10.12,1.63,4.02,0.91,0.06],["David Rivers",3.71,1.53,2.64,0.58,0.02],["Doc Rivers",10.9,2.5,3.9,1.9,0.3],["Dominique Wilkins",29.1,7,2.2,1.2,0.3],["Elmore Spencer",6.57,3.92,0.79,0.38,1.22],["Eric Piatkowski",7.73,2.18,0.98,0.6,0.19],["Eric Riley",4.4,2.8,0.3,0.4,0.9],["Gary Grant",8.15,2.42,6.13,1.61,0.16],["Harold Ellis",5.78,2.05,0.6,1.21,0.12],["Isaac Austin",15.2,8.7,3.4,0.7,0.8],["James Edwards",9.7,2.8,0.7,0.3,0.5],["James Robinson",7.68,1.65,1.8,0.58,0.12],["Jaren Jackson",3.9,1.1,1,0.6,0.1],["Jeff Martin",6.71,2.04,0.76,0.55,0.3],["Joe Wolf",4.8,3,0.8,0.4,0.3],["John Williams",6.29,4.11,2.21,0.97,0.3],["Keith Closs",3.61,2.65,0.24,0.2,1.24],["Keith Tower",2.4,1.5,0.1,0.1,0.3],["Ken Bannister",3.24,2.11,0.25,0.21,0.1],["Ken Norman",15.07,6.77,2.09,0.87,0.85],["Kevin Duckworth",4,2.3,0.6,0.3,0.4],["Kiki Vandeweghe",6.2,1.2,0.6,0.3,0.2],["Lamond Murray",11.53,4.18,1.32,1.01,0.51],["LeRon Ellis",1.5,0.8,0,0.2,0.3],["Lester Conner",2.4,1.6,2.1,1.1,0.1],["Lorenzen Wright",7.73,7.41,0.7,0.65,0.98],["Loy Vaught",11.85,8.02,1.07,0.84,0.38],["Malik Sealy",12.74,3.45,1.95,1.42,0.51],["Mark Aguirre",10.6,3,2.7,0.5,0.2],["Mark Jackson",12.68,4.55,8.7,1.6,0.1],["Matt Fish",4.7,3.2,0.7,0.6,0.3],["Maurice Taylor",13.58,4.63,1.01,0.42,0.6],["Michael Olowokandi",8.9,7.9,0.6,0.6,1.2],["Michael Smith",5.3,1.9,0.7,0.2,0.1],["Michael Young",4.9,1.9,0.5,0.6,0.1],["Olden Polynice",9.32,7.68,0.66,0.57,0.33],["Pooh Richardson",8,2.24,4.97,1.07,0.12],["Randy Woods",2.36,0.59,1.74,0.56,0.03],["Rodney Rogers",12.33,4.82,2.46,1.11,0.59],["Ron Harper",19.24,5.51,4.83,2,0.87],["Sherman Douglas",8.2,1.9,4.1,0.9,0.1],["Stanley Roberts",9.39,5.16,0.77,0.37,1.42],["Stojko Vranković",2.94,3.97,0.58,0.19,0.97],["Terry Dehere",8.88,1.53,2.72,0.54,0.08],["Tom Garrick",5.52,2.06,3.66,1.06,0.05],["Tom Tolbert",3.8,2.2,0.6,0.3,0.3],["Tony Brown",4.7,1.3,0.7,0.5,0],["Tony Massenburg",9.3,5.7,0.8,0.6,0.7],["Troy Hudson",6.8,2.2,3.7,0.4,0.1],["Tyrone Nesby",10.1,3.5,1.6,1.5,0.4],["Winston Garland",8.98,3.13,4.77,1.31,0.13]]],
    ["LAC","2000s",[["Aaron Williams",2.13,2.11,0.24,0.29,0.44],["Al Thornton",14.64,4.83,1.34,0.69,0.69],["Andre Miller",13.6,4,6.7,1.2,0.1],["Anthony Avent",1.7,1.5,0.2,0.3,0.3],["Baron Davis",14.9,3.7,7.7,1.7,0.5],["Bobby Simmons",12.72,5.39,2.27,1.19,0.24],["Brevin Knight",4.6,1.9,4.4,1.4,0.1],["Brian Skinner",4.49,4.66,0.45,0.39,0.86],["Charles Jones",3.4,1.1,1.7,0.5,0.1],["Cherokee Parks",5.35,3.89,0.76,0.44,0.57],["Chris Kaman",10.42,8.24,1.22,0.48,1.48],["Chris Wilcox",6.44,3.81,0.62,0.36,0.35],["Corey Maggette",17.27,5.22,2.41,0.84,0.18],["Cuttino Mobley",13.8,3.72,2.63,1.15,0.39],["Dan Dickau",5.3,1.4,2.6,0.5,0],["Daniel Ewing",3.37,1.25,1.4,0.55,0.1],["Darius Miles",9.45,5.7,1.7,0.75,1.4],["DeAndre Jordan",4.3,4.5,0.2,0.2,1.1],["Derek Anderson",16.9,4,3.4,1.4,0.2],["Derek Strong",4.2,3.9,0.3,0.5,0],["Doug Overton",3.48,1.3,1.98,0.43,0.02],["Earl Boykins",4.41,0.84,2.24,0.33,0],["Eddie House",6.8,2.3,2.5,1.1,0.1],["Elton Brand",20.34,10.25,2.7,0.95,2.23],["Eric Gordon",16.1,2.6,2.8,1,0.4],["Eric Murdock",5.6,1.9,2.7,1.2,0.1],["Eric Piatkowski",9.47,2.79,1.25,0.58,0.18],["Fred Jones",7.3,2.4,3.6,1,0.2],["Harold Jamison",2.2,1.6,0.2,0.2,0],["James Singleton",2.55,2.68,0.41,0.3,0.35],["Jason Hart",5.32,2.45,2.63,1.03,0.05],["Jeff McInnis",12.87,2.68,5.55,0.82,0.1],["Josh Powell",5.5,5.2,0.7,0.2,0.4],["Keith Closs",4.2,3.1,0.4,0.2,1.3],["Keyon Dooling",6,1.22,1.99,0.54,0.11],["Lamar Odom",15.93,7.35,4.62,1.02,1.28],["Lionel Chalmers",3.1,0.9,1.4,0.4,0],["Marcus Camby",10.3,11.1,2,0.8,2.1],["Mardy Collins",5.9,2.5,2.6,0.7,0.3],["Marko Jarić",8.49,2.83,4.45,1.59,0.26],["Matt Barnes",4.5,4,1.3,0.7,0.1],["Maurice Taylor",17.1,6.5,1.6,0.8,0.8],["Melvin Ely",4.14,2.9,0.39,0.2,0.51],["Michael Olowokandi",10.11,7.99,0.81,0.5,1.7],["Mike Taylor",5.7,1.7,2.1,0.7,0],["Mikki Moore",5.4,3.3,0.6,0.3,0.4],["Obinna Ekezie",1.9,1.2,0.1,0.1,0.2],["Paul Davis",2.66,1.96,0.35,0.3,0.19],["Pete Chilcutt",3,3.3,0.7,0.4,0.3],["Predrag Drobnjak",6.3,3.2,0.6,0.4,0.4],["Quentin Richardson",11.98,4.59,1.35,0.81,0.22],["Quinton Ross",4.79,2.45,1.22,0.75,0.33],["Rick Brunson",5.5,2.3,5.1,1,0.1],["Ricky Davis",6.4,1.7,2.3,0.5,0.1],["Ruben Patterson",5.1,3.2,0.9,1.1,0.4],["Sam Cassell",14.61,3.24,5.42,0.72,0.1],["Sean Rooks",4.32,3.02,0.79,0.38,0.59],["Shaun Livingston",7.43,3.15,4.83,0.97,0.48],["Steve Novak",6.9,1.8,0.6,0.3,0.1],["Tim Thomas",11.49,5.02,2.38,0.63,0.42],["Tremaine Fowlkes",4.03,2.84,0.67,0.63,0.06],["Troy Hudson",8.8,2.4,3.9,0.7,0],["Tyrone Nesby",12.4,3.67,1.56,0.95,0.38],["Vladimir Radmanović",10.7,5.7,2.1,1,0.5],["Walter McCarty",2.4,1.9,0.6,0.2,0.1],["Wang Zhizhi",4.29,1.9,0.19,0.19,0.21],["Yaroslav Korolev",1.13,0.44,0.4,0.16,0],["Zach Randolph",20.9,9.4,2.3,0.8,0.3],["Željko Rebrača",5.43,2.87,0.37,0.2,0.7]]],
    ["LAC","2010s",[["Al Thornton",10.7,3.8,1.2,0.5,0.4],["Al-Farouq Aminu",5.6,3.3,0.7,0.7,0.3],["Alan Anderson",2.9,0.8,0.4,0.1,0],["Antawn Jamison",3.8,2.5,0.3,0.4,0.1],["Austin Rivers",11.1,2.13,2.56,0.8,0.17],["Avery Bradley",8.31,2.81,1.98,0.62,0.29],["Baron Davis",14.39,3.24,7.64,1.59,0.56],["Blake Griffin",21.55,9.31,4.24,0.96,0.53],["Boban Marjanović",6.41,4.27,0.53,0.3,0.43],["Bobby Brown",3,0.9,1.8,0.3,0],["Bobby Simmons",2.9,2,0.4,0.5,0.1],["Brandon Bass",5.6,2.5,0.4,0.3,0.2],["Brian Cook",3.97,2.11,0.31,0.24,0.3],["Byron Mullens",2.5,1.2,0.2,0.2,0.1],["C.J. Wilcox",2.52,0.4,0.4,0.26,0.05],["C.J. Williams",5.5,1.5,1.1,0.8,0.3],["Caron Butler",11.11,3.26,1.09,0.74,0.1],["Chauncey Billups",11.54,1.98,3.06,0.5,0.1],["Chris Kaman",16.69,8.62,1.54,0.5,1.29],["Chris Paul",18.75,4.24,9.84,2.22,0.14],["Cole Aldrich",5.5,4.8,0.8,0.8,1.1],["Craig Smith",6.86,3.25,0.9,0.36,0.22],["Dahntay Jones",0.6,0.3,0.1,0.1,0],["Danilo Gallinari",18.74,5.79,2.46,0.68,0.35],["Darren Collison",11.4,2.4,3.7,1.2,0.2],["DeAndre Jordan",9.81,11.13,0.78,0.63,1.76],["Drew Gooden",14.8,9.4,0.9,0.6,0.3],["Ekpe Udoh",0.9,0.8,0.2,0.2,0.2],["Eric Bledsoe",6.7,2.63,3.02,1.15,0.47],["Eric Gordon",19.46,2.74,3.66,1.19,0.25],["Garrett Temple",4.7,2.5,1.4,1,0.2],["Glen Davis",4.05,2.47,0.45,0.58,0.3],["Grant Hill",3.2,1.7,0.9,0.4,0.2],["Hedo Türkoğlu",3.43,1.87,0.71,0.38,0.18],["Ike Diogu",5.8,3.2,0.1,0.1,0.1],["Ivica Zubac",9.4,7.7,1.5,0.4,0.9],["JaMychal Green",8.7,6.5,0.6,0.5,0.3],["Jamal Crawford",15.35,1.85,2.61,0.83,0.2],["Jared Dudley",6.9,2.2,1.4,0.6,0.1],["Jarron Collins",0.7,0.7,0,0.2,0],["Jawun Evans",4.8,1.8,2.1,0.8,0.1],["Jeff Green",10.9,3.4,1.5,0.7,0.8],["Jerome Robinson",3.4,1.2,0.6,0.3,0.1],["Johnathan Motley",4.6,2.3,0.5,0.2,0.1],["Jordan Farmar",4.6,1.2,1.9,0.6,0.1],["Josh Smith",5.7,3.9,1.3,0.6,1.1],["Kenyon Martin",5.2,4.3,0.4,1,1],["Lamar Odom",4,5.9,1.7,0.8,0.7],["Lance Stephenson",4.7,2.5,1.4,0.6,0.1],["Landry Shamet",10.9,2.2,2.3,0.5,0.1],["Lou Williams",21.33,2.74,5.35,0.95,0.15],["Luc Mbah a Moute",4.66,2.19,0.45,0.79,0.35],["Marcin Gortat",5,5.6,1.4,0.1,0.5],["Marcus Camby",7.7,12.1,3,1.4,1.9],["Mardy Collins",2.6,1.2,1,0.5,0],["Marreese Speights",8.7,4.5,0.8,0.3,0.5],["Matt Barnes",10.12,4.39,1.64,0.94,0.65],["Mike Scott",4.8,3.3,0.8,0.3,0.2],["Miloš Teodosić",7.92,2.38,3.97,0.42,0.1],["Mo Williams",13.79,2.08,3.84,0.97,0.07],["Montrezl Harrell",13.91,5.3,1.52,0.71,1.01],["Nick Young",9.7,1.6,0.5,0.6,0.3],["Pablo Prigioni",2.5,1.9,2.2,0.9,0],["Patrick Beverley",8.17,4.89,3.69,1,0.59],["Paul Pierce",5.32,2.48,0.84,0.42,0.27],["Randy Foye",10.41,1.85,2.45,0.7,0.35],["Rasual Butler",9.6,2.57,1.17,0.33,0.67],["Raymond Felton",6.7,2.7,2.4,0.8,0.3],["Reggie Bullock",2.66,1.41,0.26,0.27,0.04],["Reggie Evans",1.9,4.8,0.3,0.6,0.1],["Ricky Davis",4.4,1.6,1.1,0.3,0.1],["Ronny Turiaf",1.9,2.3,0.5,0.3,0.5],["Ryan Gomes",5.75,2.89,1.24,0.71,0.14],["Ryan Hollins",2.85,1.9,0.15,0.1,0.55],["Sam Dekker",4.2,2.4,0.5,0.3,0.1],["Sebastian Telfair",4.3,1.1,2.9,0.6,0.1],["Shai Gilgeous-Alexander",10.8,2.8,3.3,1.2,0.5],["Sindarius Thornwell",2.55,1.34,0.62,0.47,0.21],["Spencer Hawes",5.8,3.5,1.2,0.3,0.7],["Steve Blake",6.8,2.4,6.1,0.7,0.1],["Steve Novak",2.1,0.6,0.1,0.1,0],["Tobias Harris",20.31,7.2,2.85,0.88,0.47],["Travis Outlaw",8.7,3.6,1.1,0.5,0.4],["Tyrone Wallace",5.52,2.22,1.25,0.5,0.2],["Wesley Johnson",5.11,2.91,0.57,0.85,0.64],["Willie Green",5.74,1.34,0.84,0.4,0.2],["Willie Reed",4.9,3.1,0.2,0.2,0.6]]],
    ["LAC","2020s",[["Chris Paul",2.9,1.8,3.3,0.7,0],["Rajon Rondo",5.4,2.4,4.4,0.8,0.1],["P.J. Tucker",1.7,2.7,0.5,0.5,0.2],["Russell Westbrook",13.5,5.4,6,1.1,0.4],["Eric Gordon",12.4,1.9,2.7,0.6,0.4],["Brook Lopez",8.5,3.6,1.3,0.6,1.2],["Serge Ibaka",11.1,6.7,1.8,0.2,1.1],["Nicolas Batum",6.1,3.6,1.5,0.8,0.5],["James Harden",19.7,5.4,8.6,1.3,0.8],["Patrick Beverley",7.5,3.2,2.1,0.8,0.8],["Patty Mills",3.8,0.8,0.9,0.4,0.1],["John Wall",11.4,2.7,5.2,0.8,0.4],["DeMarcus Cousins",8.9,6.4,1.9,0.8,0.6],["Paul George",23.5,6.2,4.9,1.6,0.4],["Patrick Patterson",5.2,2,0.8,0.4,0.2],["Marcus Morris Sr.",13.3,4.2,1.6,0.6,0.3],["Kawhi Leonard",24.3,6.3,3.9,1.6,0.5],["Reggie Jackson",13.8,3.2,4,0.6,0.2],["Bradley Beal",8.2,0.8,1.7,0.5,0],["Mason Plumlee",8.1,7,2.1,0.4,0.5],["Robert Covington",7.2,4.5,1.2,1.1,1],["Rodney Hood",3.1,1.5,0.7,0.3,0.1],["Bogdan Bogdanović",9.1,2.8,2.5,0.6,0.2],["Norman Powell",17.9,3,1.8,0.9,0.3],["Ben Simmons",5,4.7,5.6,0.7,0.5],["Kris Dunn",6.8,3.3,3.2,1.6,0.3],["Yogi Ferrell",5.6,1.9,2.2,0.7,0.3],["Ivica Zubac",11.7,9.5,1.6,0.4,1.1],["Derrick Jones Jr.",10.1,3.5,1.1,0.9,0.7],["Luke Kennard",10.1,3,1.9,0.5,0.1],["John Collins",13.6,5.3,1,0.9,0.7],["Isaiah Hartenstein",8.3,4.9,2.4,0.7,1.1],["Semi Ojeleye",3.3,2.5,0.3,0.2,0.2],["Daniel Theis",6.3,4.1,1,0.4,0.9],["Drew Eubanks",4.6,3.7,0.9,0.2,0.6],["Amir Coffey",6.4,1.9,1.1,0.4,0.1],["Terance Mann",8.9,3.9,2,0.6,0.2],["Darius Garland",18.8,2.4,6.7,1,0.2],["Moses Brown",4.3,3.9,0.1,0.1,0.4],["Xavier Moon",3.3,1.2,1.7,0.3,0.2],["Daniel Oturu",1.8,1.6,0.3,0.1,0.2],["Jay Scrubb",5.8,2.2,0.3,0.6,0.1],["Malik Fitts",1,1,0,0,0],["Brandon Boston",6.1,1.7,0.8,0.4,0.2],["Bones Hyland",9.4,1.9,2.8,0.7,0.2],["Isaiah Jackson",6.7,5.3,0.9,0.7,0.9],["Jason Preston",2.9,1.6,1.9,0.1,0],["Joshua Primo",1,0.5,0,0,0.5],["Bennedict Mathurin",17.6,5.4,2.4,0.8,0.2],["TyTy Washington Jr.",1.3,0.4,1.1,0.4,0.2],["Patrick Baldwin Jr.",2.2,1,0.1,0.1,0.1],["Alondes Williams",5,0,1,0,0],["Moussa Diabaté",2.7,2.2,0.3,0.4,0.2],["Kobe Brown",1.9,1.5,0.6,0.2,0.1],["Jordan Miller",5.2,1.7,1.1,0.4,0.1],["Norchad Omier",2.8,1.2,0.3,0.2,0],["Trentyn Flowers",1.8,0.7,0,0,0],["Cam Christie",2.1,1.1,0.6,0.3,0.1],["Kobe Sanders",7.3,2.3,1.6,0.7,0.1],["Yanic Konan Niederhäuser",4.3,2.9,0.3,0.1,0.7],["Sean Pedulla",1.9,0.4,0.7,0,0],["Jahmyl Telfort",0.1,0.4,0.1,0.1,0]]],
    ["LAL","1960s",[["Archie Clark",15.35,3.57,3.58,null,null],["Bill Hewitt",7.2,4.4,1,null,null],["Bob Boozer",12.2,7,1.1,null,null],["Bob McNeill",1.8,0.8,1.4,null,null],["Boo Ellis",3.9,5.1,0.6,null,null],["Cliff Anderson",3.05,1.06,0.9,null,null],["Cotton Nash",2.1,1.4,0.4,null,null],["Darrall Imhoff",7.55,9.43,1.97,null,null],["Dennis Hamilton",2.8,1.6,0.7,null,null],["Dick Barnett",16.79,2.97,2.68,null,null],["Dick Garmaker",11.7,4.3,3,null,null],["Don Nelson",4.28,3.31,0.87,null,null],["Ed Fleming",6.3,3.2,1.4,null,null],["Elgin Baylor",28.11,13.75,4.29,null,null],["Erwin Mueller",8.3,5.7,2,null,null],["Frank Selvy",10.45,3.6,3.22,null,null],["Freddie Crawford",7.51,2.76,2.09,null,null],["Gail Goodrich",11.55,2.63,2.34,null,null],["Gary Alcorn",1.6,2.5,0.1,null,null],["Gene Wiley",4.24,7.29,0.83,null,null],["Hank Finkel",1.5,2.4,0.2,null,null],["Hot Rod Hundley",8.45,3.34,3.8,null,null],["Howie Jolliff",2.81,4.26,0.8,null,null],["Hub Reed",1.7,2.3,0.5,null,null],["Jerry Chambers",7.5,3,0.6,null,null],["Jerry West",27.52,6.49,5.68,null,null],["Jim Barnes",6.72,5.39,0.6,null,null],["Jim King",6.05,2.51,2.37,null,null],["Jim Krebs",7.88,5.85,0.93,null,null],["John Block",2.9,2,0.2,null,null],["John Fairchild",2,1.5,0.4,null,null],["John Wetzel",3.7,2.2,1.3,null,null],["Johnny Egan",8.5,1.8,2.6,null,null],["Keith Erickson",8.4,4,2.5,null,null],["Larry Foust",13.3,9.3,1.6,null,null],["Leroy Ellis",9.09,7.58,0.65,null,null],["Mel Counts",11.46,8,1.42,null,null],["Ray Felix",6.39,6.71,0.65,null,null],["Ron Horn",2.6,2.5,0.4,null,null],["Rudy LaRusso",14.14,9.59,2.09,null,null],["Slick Leonard",6.18,2.5,2.64,null,null],["Tom Hawkins",8.99,5.68,1.14,null,null],["Walt Hazzard",9.37,2.48,3.8,null,null],["Wayne Yates",1.9,2.5,0.4,null,null],["Wilt Chamberlain",20.5,21.1,4.5,null,null]]],
    ["LAL","1970s",[["Adrian Dantley",18.31,6.42,2.83,1.2,0.15],["Bill Bridges",8.49,8.95,2.41,0.8,0.46],["Bill Hewitt",3.3,7.1,1.4,null,null],["Bo Lamar",7.1,1.3,2.5,0.8,0],["Brad Davis",2.67,0.98,2.41,0.49,0.09],["Brian Winters",11.7,2,2.9,1.1,0.3],["C.J. Kupec",4.21,2.24,0.55,0.2,0],["Cazzie Russell",14.52,3.04,2.24,0.83,0.06],["Charlie Scott",11.7,3.1,4.9,1.2,0.2],["Cliff Meely",3.2,2.3,0.5,0.3,0.2],["Connie Hawkins",10.99,6.34,4.36,1.39,0.87],["Corky Calhoun",5.23,4.33,1.19,0.84,0.46],["Cornell Warner",6.8,8.31,1.23,0.61,0.53],["Dave Robisch",4.76,3.48,1,0.3,0.3],["Dick Garrett",11.6,3.2,2.5,null,null],["Don Chaney",5.83,3.81,3.61,1.62,0.39],["Don Ford",7.8,4.15,1.55,0.72,0.35],["Donnie Freeman",10.8,2.8,2.7,0.9,0.2],["Earl Tatum",10.64,3.53,2,1.35,0.33],["Elgin Baylor",21.88,9.68,4.79,null,null],["Elmore Smith",11.74,11.06,1.95,1,3.95],["Ernie DiGregorio",3.9,0.9,2.8,0.2,0],["Flynn Robinson",9.54,1.75,2.12,null,null],["Fred Hetzel",4.8,2.5,0.6,null,null],["Gail Goodrich",22.5,3.22,5.04,1.5,0.13],["Happy Hairston",15.24,12.42,2.32,0.75,0.15],["Jamaal Wilkes",16.41,7.44,3.11,1.56,0.34],["James Edwards",14.8,7.2,1.2,0.6,1.1],["Jerry West",26.11,4.33,8.65,2.6,0.7],["Jim Cleamons",2.6,1,0.9,null,null],["Jim McDaniels",2.6,2.1,0.4,0.1,0.3],["Jim McMillian",15.35,5.36,2.3,null,null],["Jim Price",9.91,2.9,3.31,1.47,0.3],["John Trapp",5.45,3.08,0.68,null,null],["John Tresvant",5.76,3.11,1.01,null,null],["Johnny Egan",7.3,1.4,3,null,null],["Johnny Neumann",5.9,1.1,2.3,0.5,0.1],["Kareem Abdul-Jabbar",25.89,14.05,4.67,1.33,3.61],["Keith Erickson",9.48,4.66,3.08,null,null],["Kenny Carr",6.9,4.06,0.67,0.42,0.36],["Kermit Washington",6.27,6.72,0.86,0.58,0.72],["Leroy Ellis",4.36,4.09,0.56,null,null],["Lou Hudson",11.8,2.06,2.11,0.9,0.2],["Lucius Allen",15.94,3.38,5.15,1.61,0.32],["Mel Counts",7.89,5.73,1.52,0.4,0.5],["Mike Lynn",2.7,1.5,0.7,null,null],["Nate Hawthorne",3.2,1,0.7,0.3,0.2],["Norm Nixon",15.41,2.9,7.91,2.1,0.15],["Pat Riley",7.82,1.56,1.68,0.8,0.05],["Rick Roberson",7.06,7.04,0.97,null,null],["Ron Boone",7.4,1.8,1.9,0.8,0.1],["Ron Carter",3.1,1,0.5,0.4,0.2],["Stan Love",6.19,3.26,0.9,0.5,0.4],["Stu Lantz",7.06,2.47,2.12,0.65,0.15],["Tom Abernethy",6.56,3.89,1.4,0.75,0.2],["Travis Grant",3.57,1.49,0.18,0,0],["Willie McCarter",7.31,1.77,1.91,null,null],["Wilt Chamberlain",16.75,18.65,4.26,null,null],["Zelmo Beaty",5.5,4.7,1.1,0.7,0.4]]],
    ["LAL","1980s",[["A.C. Green",10.47,7.52,1.05,0.93,0.7],["Adrian Branch",4.3,1.7,0.5,0.5,0.1],["Alan Hardy",2.3,0.9,0.1,0,0.4],["Billy Thompson",5.07,2.65,0.88,0.27,0.43],["Bob McAdoo",12.09,4.43,0.95,0.56,0.81],["Brad Holland",3.01,0.56,0.6,0.45,0],["Butch Carter",5.6,1.2,1,0.4,0],["Byron Scott",16.78,3.18,3.05,1.39,0.26],["Calvin Garrett",4.6,1.7,0.8,0.3,0],["Clay Johnson",3.08,1.44,0.56,0.49,0.14],["David Rivers",2.9,0.9,2.3,0.5,0.2],["Don Ford",3,1.9,0.7,0.2,0.3],["Dwight Jones",4.9,3.6,0.7,0.4,0.3],["Eddie Jordan",4.04,0.94,2.67,1.1,0.04],["Frank Brickowski",3.9,2.6,0.3,0.4,0.1],["Jamaal Wilkes",19.04,4.82,2.41,1.14,0.32],["James Worthy",17.86,5.7,2.81,1.13,0.84],["Jeff Lamp",1.53,0.83,0.37,0.18,0.09],["Jim Brewer",2.61,3.65,0.65,0.55,0.65],["Jim Chones",10.7,7.45,1.85,0.6,1],["Kareem Abdul-Jabbar",20.65,7.61,2.82,0.73,2.03],["Kevin McKenna",1.9,0.8,0.4,0.3,0.1],["Kurt Rambis",5.29,5.89,0.88,0.91,0.58],["Larry Spriggs",5.4,2.36,1.36,0.47,0.18],["Magic Johnson",19.5,7.39,11.21,2.04,0.43],["Mark Landsberger",4.73,5.19,0.4,0.22,0.11],["Mark McNamara",2.9,2.6,0.3,0.1,0.1],["Marty Byrnes",2,0.8,0.4,0.2,0],["Maurice Lucas",10.2,7.4,1.1,0.6,0.3],["Michael Cooper",9.11,3.21,4.35,1.22,0.61],["Mike McGee",8.17,2.01,0.93,0.55,0.1],["Mike Smrek",2.55,1.5,0.16,0.1,0.69],["Milt Wagner",3.8,0.7,1.5,0.2,0.1],["Mitch Kupchak",6.44,3.91,0.46,0.26,0.23],["Mychal Thompson",10.35,5.63,0.72,0.57,0.86],["Norm Nixon",16.86,2.6,7.95,1.63,0.13],["Ollie Mack",1.9,0.8,0.7,0.1,0],["Orlando Woolridge",9.7,3.6,0.8,0.4,0.9],["Ronnie Lester",2.66,0.62,2.27,0.41,0.1],["Spencer Haywood",9.7,4.6,1.2,0.5,0.8],["Swen Nater",4.5,3.8,0.4,0.4,0.1],["Tony Campbell",7.02,2.1,0.79,0.63,0.12],["Wes Matthews",4.96,1.1,2.35,0.5,0.1]]],
    ["LAL","1990s",[["A.C. Green",12.1,8.25,1.2,0.92,0.45],["Anthony Miller",3.06,2.41,0.54,0.29,0.13],["Anthony Peeler",10.64,2.34,1.99,0.84,0.18],["Antonio Harvey",2.87,1.86,0.34,0.3,0.7],["Benoit Benjamin",4.5,3.4,0.4,0.5,0.5],["Byron Scott",13.04,2.77,2.5,1.01,0.28],["Cedric Ceballos",20.82,7.33,1.64,1.09,0.33],["Chucky Brown",3.8,2.1,0.6,0.3,0.2],["Corie Blount",3.57,4,0.56,0.38,0.45],["Dennis Rodman",2.1,11.2,1.3,0.4,0.5],["Derek Fisher",5.11,1.81,3.07,0.82,0.08],["Derek Harper",6.9,1.5,4.2,1,0.1],["Derek Strong",3.4,2.8,0.5,0.3,0.2],["Doug Christie",9.23,3.23,2.15,1.3,0.35],["Duane Cooper",2.4,0.8,2.3,0.3,0],["Eddie Jones",15.26,3.79,3.04,2.04,0.66],["Elden Campbell",10.37,5.82,1.11,0.68,1.66],["Fred Roberts",3.7,1.4,0.8,0.5,0.1],["George Lynch",6.46,3.99,1.06,0.96,0.23],["George McCloud",4.1,1.6,0.7,0.4,0],["Glen Rice",17.5,3.7,2.6,0.6,0.2],["J.R. Reid",5,4,0.9,0.6,0],["Jack Haley",1.6,1.9,0.1,0.1,0.2],["James Edwards",5.56,1.67,0.66,0.15,0.1],["James Worthy",17.3,4.2,3.33,1.1,0.38],["Jay Vincent",3.8,1.1,0.4,0.3,0.1],["Jerome Kersey",6.8,5.2,1.3,1.7,0.7],["Jon Barry",2.5,0.8,1,0.5,0.1],["Kobe Bryant",13.76,3.22,2.4,0.95,0.55],["Kurt Rambis",2.75,2.94,0.6,0.3,0.43],["Larry Drew",4.34,1.01,2.62,0.49,0.06],["Lloyd Daniels",7.4,2.2,1.4,0.8,0.4],["Magic Johnson",19.8,6.61,11.14,1.38,0.32],["Mario Bennett",3.9,2.8,0.4,0.4,0.2],["Mark McNamara",3.1,1.9,0.1,0.1,0],["Michael Cooper",6.4,2.8,2.7,0.8,0.5],["Mychal Thompson",7.01,4.97,0.45,0.4,0.65],["Nick Van Exel",14.94,2.8,7.29,1,0.1],["Orlando Woolridge",12.7,3,1.5,0.6,0.7],["Reggie Jordan",5.4,2.9,1.1,0.6,0.2],["Rick Fox",10.95,3.56,2.91,0.99,0.46],["Robert Horry",6.98,6.14,2.1,1.42,1.21],["Rory Sparrow",3,0.6,1.9,0.3,0.1],["Ruben Patterson",2.7,1.3,0.1,0.2,0.1],["Sam Bowie",5.77,4.54,1.83,0.27,1.17],["Sam Perkins",14.57,7.96,2.03,0.91,1.04],["Sean Rooks",3.42,2.44,0.53,0.12,0.53],["Sedale Threatt",11.92,2.33,5.22,1.39,0.16],["Shaquille O'Neal",27.02,11.54,2.59,0.76,2.34],["Terry Teagle",10.3,2.2,1.2,0.6,0.1],["Tony Smith",5.78,1.71,1.75,0.7,0.14],["Travis Knight",4.59,4.16,0.6,0.47,0.77],["Vlade Divac",12.49,8.68,2.6,1.27,1.6]]],
    ["LAL","2000s",[["A.C. Green",5,5.9,1,0.6,0.2],["Aaron McKie",1.21,1.57,1.01,0.4,0],["Andrew Bynum",8.86,6.19,1.07,0.2,1.49],["Brian Cook",6.63,3.16,0.76,0.41,0.4],["Brian Grant",3.8,3.7,0.5,0.3,0.3],["Brian Shaw",4.04,2.65,2.27,0.48,0.21],["Bryon Russell",4,2,1,0.4,0.2],["Caron Butler",15.5,5.8,1.9,1.4,0.3],["Chris Mihm",8.32,5.62,0.78,0.22,1.11],["Chucky Atkins",13.6,2.4,4.4,0.9,0],["D.J. Mbenga",2.59,1.46,0.29,0.29,0.79],["Derek Fisher",9.52,2.22,2.97,1.13,0.07],["Devean George",6,3.33,1.01,0.73,0.41],["Gary Payton",14.6,4.2,5.5,1.2,0.2],["Glen Rice",15.9,4.1,2.2,0.6,0.2],["Greg Foster",2,1.8,0.5,0.1,0.2],["Horace Grant",6.67,5.89,1.48,0.58,0.63],["Isaiah Rider",7.6,2.3,1.7,0.4,0.1],["Jannero Pargo",2.11,0.93,1.02,0.34,0.07],["Javaris Crittenton",3.3,1,0.8,0.3,0],["Jelani McCoy",1.2,1.2,0.3,0,0.2],["John Salley",1.6,1.4,0.6,0.2,0.3],["Jordan Farmar",6.75,1.92,2.35,0.8,0.13],["Josh Powell",4.2,2.9,0.5,0.2,0.3],["Jumaine Jones",7.6,5.2,0.9,0.6,0.3],["Kareem Rush",4.33,1.2,0.8,0.28,0.19],["Karl Malone",13.2,8.7,3.9,1.2,0.5],["Kobe Bryant",28.16,5.85,5.26,1.66,0.57],["Kwame Brown",7.41,6.27,1.28,0.63,0.81],["Lamar Odom",14.15,9.56,3.99,0.91,0.94],["Laron Profit",4.2,1.7,0.6,0.4,0.2],["Lindsey Hunter",5.8,1.5,1.6,0.8,0.2],["Luke Walton",5.62,3.21,2.53,0.61,0.21],["Mark Madsen",2.61,2.57,0.55,0.22,0.22],["Maurice Evans",8.06,2.77,1.06,0.52,0.19],["Mike Penberthy",4.82,1.17,1.27,0.42,0],["Mitch Richmond",4.1,1.5,0.9,0.3,0.1],["Pau Gasol",18.88,9.15,3.5,0.58,1.15],["Rick Fox",7.87,3.72,2.88,0.8,0.28],["Robert Horry",6.06,5.21,2.26,1,0.92],["Ron Harper",6.81,3.94,3.03,0.99,0.5],["Ronny Turiaf",5.45,3.47,1.14,0.28,1.14],["Samaki Walker",5.57,6.26,0.95,0.35,1.05],["Sasha Vujačić",5.36,1.8,1.29,0.64,0.05],["Shammond Williams",3.1,1.3,1,0.4,0],["Shaquille O'Neal",27.05,11.99,3.32,0.56,2.56],["Smush Parker",11.3,2.9,3.25,1.6,0.15],["Stanislav Medvedenko",5.43,2.9,0.52,0.36,0.17],["Tierre Brown",4.4,1.2,2,0.4,0],["Tracy Murray",2,0.7,0.4,0.2,0.1],["Travis Knight",1.7,2,0.4,0.1,0.4],["Trevor Ariza",8.36,4.12,1.73,1.56,0.3],["Tyronn Lue",3.85,0.92,1.36,0.48,0],["Vladimir Radmanović",7.11,3.08,1.36,0.61,0.23]]],
    ["LAL","2010s",[["Adam Morrison",2.4,1,0.6,0.1,0.1],["Alex Caruso",5.86,2.16,2.44,0.76,0.34],["Andrew Bogut",1.5,3.3,0.6,0.2,0.5],["Andrew Bynum",15.12,9.81,1.25,0.47,1.75],["Andrew Goudelock",4.29,0.8,0.49,0.1,0],["Antawn Jamison",9.4,4.8,0.7,0.4,0.3],["Anthony Brown",4,2.4,0.7,0.5,0.2],["Brandon Bass",7.2,4.3,1.1,0.5,0.8],["Brandon Ingram",13.92,4.7,2.91,0.63,0.59],["Brook Lopez",13,4,1.7,0.4,1.3],["Carlos Boozer",11.8,6.8,1.3,0.6,0.2],["Chris Duhon",2.9,1.5,2.9,0.4,0],["Chris Kaman",10.4,5.9,1.5,0.3,1],["Corey Brewer",4.22,1.85,1.02,0.86,0.16],["D'Angelo Russell",14.26,3.44,3.96,1.29,0.24],["D.J. Mbenga",2.1,1.8,0.2,0.1,0.6],["Darius Morris",3.55,1.09,1.46,0.31,0],["David Nwaba",6,3.2,0.7,0.7,0.4],["Derek Fisher",6.89,2.02,2.75,1.1,0.1],["Derrick Caracter",2,1,0.2,0.1,0.2],["Devin Ebanks",3.53,1.98,0.37,0.31,0.24],["Dwight Howard",17.1,12.4,1.4,1.1,2.4],["Earl Clark",7.3,5.5,1.1,0.6,0.7],["Ed Davis",8.3,7.6,1.2,0.6,1.2],["Isaac Bonga",0.9,1.1,0.7,0.4,0.2],["Ivica Zubac",6.36,3.91,0.72,0.24,0.64],["JaVale McGee",12,7.5,0.7,0.6,2],["Jason Kapono",2,0.5,0.4,0.1,0],["Jeremy Lin",11.2,2.6,4.6,1.1,0.4],["Jodie Meeks",11.77,2.35,1.35,1.05,0.1],["Johnathan Williams",6.5,4.1,0.5,0.3,0.3],["Jordan Clarkson",14.29,3.33,2.87,0.98,0.12],["Jordan Farmar",8.17,1.9,2.63,0.7,0.13],["Jordan Hill",9.92,7.2,0.99,0.43,0.79],["Josh Hart",7.85,3.94,1.35,0.85,0.45],["Josh McRoberts",2.8,3.4,1,0.3,0.4],["Josh Powell",2.7,1.8,0.6,0.1,0.1],["José Calderón",3.3,1.8,2.1,0.3,0],["Julius Randle",13.51,8.9,2.63,0.63,0.46],["Kendall Marshall",8,2.9,8.8,0.9,0.1],["Kent Bazemore",13.1,3.3,3.1,1.3,0.3],["Kentavious Caldwell-Pope",12.35,3.99,1.73,1.14,0.2],["Kobe Bryant",24.67,5.11,4.78,1.25,0.23],["Kyle Kuzma",17.34,5.92,2.13,0.6,0.4],["Lamar Odom",12.6,9.25,3.15,0.75,0.7],["Lance Stephenson",7.2,3.2,2.1,0.6,0.1],["Larry Nance Jr.",6.88,5.79,1.17,1.18,0.5],["LeBron James",27.4,8.5,8.3,1.3,0.6],["Lonzo Ball",10.06,6.14,6.35,1.61,0.61],["Lou Williams",16.83,2.41,2.82,0.99,0.25],["Luke Walton",1.88,1.27,1.15,0.23,0.06],["Luol Deng",7.5,5.21,1.29,0.9,0.39],["Marcelo Huertas",3.96,1.49,3.07,0.47,0.1],["Matt Barnes",7.3,4.95,1.68,0.65,0.62],["Metta World Peace",8.94,3.64,1.94,1.26,0.39],["Michael Beasley",7,2.3,1,0.3,0.4],["Moritz Wagner",4.8,2,0.6,0.3,0.3],["Nick Young",13.16,2.26,1.05,0.56,0.19],["Pau Gasol",17.38,10.13,3.52,0.57,1.5],["Rajon Rondo",9.2,5.3,8,1.2,0.2],["Ramon Sessions",12.7,3.8,6.2,0.7,0.1],["Robert Sacre",4.17,3.15,0.67,0.31,0.56],["Ronnie Price",5.1,1.6,3.8,1.6,0.1],["Roy Hibbert",5.9,4.9,1.2,0.4,1.4],["Ryan Kelly",6.5,3.31,1.43,0.51,0.57],["Sasha Vujačić",2.66,1.09,0.59,0.27,0.09],["Shannon Brown",8.4,2.05,1.25,0.75,0.3],["Shawne Williams",5.6,4.6,0.8,0.5,0.8],["Steve Blake",5.77,2.33,3.55,0.72,0.04],["Steve Nash",11.34,2.59,6.47,0.58,0.1],["Svi Mykhailiuk",3.3,0.9,0.8,0.3,0],["Tarik Black",5.47,5.12,0.62,0.37,0.62],["Thomas Robinson",5,4.6,0.6,0.5,0.2],["Timofey Mozgov",7.4,4.9,0.8,0.3,0.6],["Troy Murphy",3.2,3.2,0.9,0.3,0.3],["Tyler Ennis",5.14,1.63,2.04,0.69,0.17],["Tyson Chandler",3.1,5.6,0.6,0.4,0.5],["Wayne Ellington",10,3.2,1.6,0.5,0],["Wesley Johnson",9.49,4.3,1.6,0.95,0.8],["Xavier Henry",8.65,2.3,1.04,0.88,0.17]]],
    ["LAL","2020s",[["LeBron James",25.9,7.6,7.4,1.1,0.7],["Carmelo Anthony",13.3,4.2,1,0.7,0.8],["Dwight Howard",6.2,5.9,0.6,0.6,0.6],["Trevor Ariza",4,3.4,1.1,0.5,0.3],["Jared Dudley",0.5,1.8,0.4,0.1,0.1],["Marc Gasol",5,4.1,2.1,0.5,1.1],["Russell Westbrook",18.5,7.4,7.1,1,0.3],["D.J. Augustin",5.3,1.2,1.9,0.3,0],["Darren Collison",1.3,1.3,0.7,0.3,0],["Wayne Ellington",6.7,1.8,0.7,0.5,0.1],["Wesley Matthews",4.8,1.6,0.9,0.7,0.3],["Avery Bradley",6.4,2.2,0.8,0.9,0.1],["Markieff Morris",5.2,3,1.3,0.2,0.2],["Anthony Davis",23.9,10.7,3.1,1.2,2],["Andre Drummond",14.9,12,2,1.4,1.1],["Kent Bazemore",3.4,1.8,0.9,0.6,0.2],["Alex Len",1.6,2.1,0.8,0.2,0.5],["Ben McLemore",7.7,1.9,0.7,0.4,0.2],["Dennis Schröder",14,3,5.2,1,0.2],["Kentavious Caldwell-Pope",9.7,2.7,1.9,0.9,0.4],["Spencer Dinwiddie",10.5,2.7,4.7,0.7,0.3],["Marcus Smart",9.3,2.8,3,1.4,0.4],["Montrezl Harrell",13.5,6.2,1.1,0.7,0.7],["D'Angelo Russell",17.9,3,6.2,0.9,0.5],["Stanley Johnson",6.7,3.2,1.7,0.9,0.3],["Christian Wood",6.9,5.1,1,0.3,0.7],["Malik Beasley",12.7,3.5,1.5,0.8,0.1],["Taurean Prince",8.9,2.9,1.5,0.7,0.4],["Dorian Finney-Smith",8.7,3.9,1.4,0.9,0.4],["Shaquille Harrison",8.8,4.4,6,2.2,0.4],["Alex Caruso",6.4,2.9,2.8,1.1,0.3],["Alfonzo McKinnie",3.1,1.4,0.2,0.2,0],["Malik Monk",13.8,3.4,2.9,0.8,0.4],["Luke Kennard",8.4,2.3,2.2,0.7,0.1],["Harry Giles III",2.4,1.3,0.3,0.1,0.1],["Kyle Kuzma",12.9,6.1,1.9,0.5,0.6],["Sterling Brown",0,2,0.5,0.8,0],["Maxi Kleber",2.5,2.4,0.9,0.3,0.4],["Kostas Antetokounmpo",0.8,1.3,0.1,0.1,0.3],["Mo Bamba",6.6,4.6,0.9,0.3,0.9],["Troy Brown Jr.",7.1,4.1,1.3,0.8,0.2],["Shake Milton",5.5,1.8,1.8,0.4,0.1],["Jarred Vanderbilt",5.4,5.5,1.5,1,0.3],["Lonnie Walker IV",11.7,1.9,1.1,0.5,0.3],["Deandre Ayton",12.5,8,0.8,0.6,1],["Luka Dončić",30.9,7.9,8,1.7,0.5],["Rui Hachimura",12.3,4.3,1.1,0.6,0.4],["Wenyen Gabriel",5.5,4,0.5,0.3,0.5],["Jemerrio Jones",2,1.5,0,0.5,0],["Gabe Vincent",4.8,1.1,1.6,0.8,0.1],["Cam Reddish",4.3,2,0.8,1,0.3],["Sekou Doumbouya",7,3,0,1.5,1],["Jaxson Hayes",6.2,4,0.8,0.5,0.7],["Talen Horton-Tucker",9.5,2.9,2.8,1,0.4],["Devontae Cacok",2,1.6,0.1,0.3,0.2],["Skylar Mays",4.1,1.1,2.2,0.6,0.1],["Mason Jones",6.8,2.5,1,0.5,0],["Kylor Kelley",3.1,3.5,0.5,0.1,0.3],["Austin Reaves",15.9,3.9,4.4,0.8,0.3],["Scotty Pippen Jr.",2.3,0.7,0.3,0.3,0.2],["Jay Huff",0,1,0.3,0.3,0.3],["Mac McClung",4,1.5,0.5,0.5,0.5],["Colin Castleton",1.5,0.8,0.2,0.1,0],["Jordan Goodwin",5.6,3.9,1.4,1,0.4],["Max Christie",3.7,2,0.7,0.2,0.2],["Christian Koloko",2.4,2.5,0.4,0.2,0.4],["Drew Timme",3.4,1.2,0.9,0.2,0],["Jake LaRavia",8.2,4,1.8,1.3,0.5],["Cole Swider",1.3,1,0.6,0,0],["Jalen Hood-Schifino",1.6,0.6,0.4,0.1,0.1],["Maxwell Lewis",0.3,0.1,0.2,0.1,0],["Kobe Bufkin",2.9,0.8,0.6,0.1,0.2],["Nick Smith Jr.",6.2,0.8,1,0.3,0.1],["D'Moi Hodge",2,0,0.7,0.1,0.1],["Trey Jemison III",2.5,2.8,0.4,0.2,0.4],["Dalton Knecht",6.7,2.1,0.6,0.2,0.2],["Bronny James",2.6,0.6,1,0.4,0.1],["Armel Traore",1.6,1.7,0.1,0.4,0.2],["Quincy Olivari",1.5,0,0.5,0,0],["Adou Thiero",1.9,1.1,0.4,0.3,0.1],["Chris Mañon",0.8,1.1,0.3,0.6,0.2]]],
    ["MEM","1990s",[["Aaron Williams",6.2,4.3,0.5,0.5,0.8],["Anthony Avent",5.8,5,1,0.4,0.6],["Anthony Peeler",14.04,3.31,3.53,1.46,0.18],["Antonio Daniels",7.8,1.9,4.5,0.7,0.1],["Ashraf Amaya",6.3,5.6,0.6,0.4,0.2],["Blue Edwards",10.68,3.36,2.37,1.07,0.41],["Bobby Hurley",4.5,1.1,3.6,0.4,0],["Bryant Reeves",14.8,7.57,1.83,0.5,0.84],["Byron Scott",10.2,2.4,1.5,0.8,0.3],["Cherokee Parks",5.5,5.1,0.8,0.6,0.6],["Chris King",7.9,3.6,1.3,0.9,0.4],["Chris Robinson",4.26,1.45,1.32,0.62,0.17],["Darrick Martin",6.7,1.6,2.5,1.1,0],["DeJuan Wheat",4.5,1,2.2,0.6,0],["Doug Edwards",3,2.8,1.3,0.3,0.6],["Eric Mobley",4.14,3.03,0.55,0.31,0.56],["Eric Murdock",9.1,2.4,4.6,2,0.1],["Felipe López",9.3,3.5,1.3,1,0.3],["George Lynch",7.77,5.07,1.63,1.03,0.47],["Gerald Wilkins",6.7,2.3,2.4,0.8,0.1],["Greg Anthony",11.82,2.65,6.61,1.85,0.15],["Ivano Newbill",2.1,2.5,0.3,0.4,0.1],["J.R. Henderson",3.2,1.6,0.7,0.3,0.1],["Kenny Gattison",9.2,4.6,0.6,0.4,0.4],["Lawrence Moten",6.66,1.64,1.58,0.7,0.32],["Lee Mayberry",4.71,1.48,4.16,0.8,0.09],["Michael Smith",5.3,7.15,1.38,0.96,0.32],["Mike Bibby",13.2,2.7,6.5,1.6,0.1],["Otis Thorpe",11.2,7.9,3.4,0.6,0.5],["Pete Chilcutt",4.13,3.16,1.03,0.55,0.39],["Rich Manning",3.38,1.72,0.16,0.14,0.16],["Roy Rogers",6.6,4.7,0.6,0.3,2],["Sam Mack",11.28,2.42,1.65,0.8,0.18],["Shareef Abdur-Rahim",21.11,7.12,2.64,1.13,0.98],["Terry Dehere",3.4,1,1.2,0.2,0.1],["Tony Massenburg",8.44,4.71,0.38,0.48,0.61]]],
    ["MEM","2000s",[["Alexander Johnson",4.4,3.1,0.3,0.4,0.6],["Andre Brown",3,2.8,0.2,0.2,0.1],["Antoine Carr",3.2,1.5,0.3,0.1,0.3],["Antonio Burks",2.3,0.57,1.27,0.43,0],["Bo Outlaw",4.6,4.2,1.1,0.9,0.9],["Bobby Jackson",11.4,3.1,2.7,0.9,0],["Bonzi Wells",11.28,3.35,1.48,1.2,0.35],["Brent Price",3.25,0.87,1.59,0.39,0],["Brevin Knight",5.42,1.79,4.94,1.4,0.05],["Brian Cardinal",5.64,2.74,1.27,0.89,0.13],["Bryant Reeves",8.59,5.86,1.15,0.55,0.65],["Casey Jacobsen",2,1.2,0.4,0.1,0],["Cherokee Parks",3,3.3,0.6,0.5,0.8],["Chucky Atkins",12.54,1.83,4.02,0.7,0.06],["Dahntay Jones",5.15,1.6,0.63,0.43,0.24],["Damon Jones",6.5,1.7,3.2,0.5,0],["Damon Stoudamire",8.41,2.55,4.56,0.75,0],["Darius Miles",3.5,1.7,0.5,0.3,0.6],["Darko Miličić",6.41,5.26,0.71,0.45,1.23],["Darrell Arthur",5.6,4.6,0.6,0.7,0.7],["Dennis Scott",5.6,1.6,1,0.4,0.1],["Doug West",3.41,1.65,1.04,0.27,0.23],["Drew Gooden",12.1,5.8,1.2,0.7,0.4],["Earl Watson",6.3,2.13,4.11,1.07,0.2],["Eddie Gill",5,1.2,2.1,0.5,0.1],["Eddie Jones",10.07,3.25,2.04,1.45,0.32],["Erick Strickland",6.4,3.5,3,1,0],["Felipe López",4.5,1.9,0.7,0.5,0.3],["Gordan Giriček",11.2,2.2,1.4,0.4,0.1],["Grant Long",5.82,4.27,1.53,1.06,0.2],["Greg Buckner",2.5,2.1,0.9,0.5,0.1],["Hakim Warrick",10.18,4.31,0.71,0.46,0.4],["Isaac Austin",4.1,4.04,0.96,0.4,0.34],["Jake Tsakalidis",3.84,3.19,0.32,0.23,0.56],["James Posey",11.58,4.71,1.61,1.43,0.5],["Jason Collins",2.6,2.9,0.2,0.4,0.5],["Jason Williams",11.91,2.37,7.18,1.31,0.1],["Javaris Crittenton",6.46,2.74,1.1,0.34,0.08],["Juan Carlos Navarro",10.9,2.6,2.2,0.6,0],["Junior Harrington",5.2,2.3,3.1,0.7,0.2],["Kevin Edwards",3.5,1.8,1.1,0.6,0.2],["Kyle Lowry",8.62,2.76,3.57,1.09,0.25],["Lawrence Roberts",3.8,3.55,0.45,0.51,0.16],["Lorenzen Wright",9.36,7.1,0.97,0.7,0.76],["Mahmoud Abdul-Rauf",6.5,0.6,1.9,0.2,0],["Marc Gasol",11.9,7.4,1.7,0.8,1.1],["Marko Jarić",2.6,1.2,1.4,0.5,0.2],["Michael Dickerson",16.7,3.26,2.8,1.15,0.44],["Mike Batiste",6.4,3.4,0.7,0.6,0.2],["Mike Bibby",15.2,3.7,8.25,1.45,0.15],["Mike Conley",10.31,3.09,4.26,0.98,0.06],["Mike Miller",14.56,4.88,3.3,0.7,0.28],["Milt Palacio",2,1,0.9,0.4,0],["O.J. Mayo",18.5,3.8,3.2,1.1,0.2],["Obinna Ekezie",3.2,2.4,0.2,0.2,0.1],["Othella Harrington",12.33,6.8,1.06,0.4,0.67],["Pau Gasol",18.85,8.6,3.08,0.53,1.84],["Quinton Ross",3.9,1.9,0.7,0.5,0.2],["Rodney Buford",9.4,4.3,1.1,0.7,0.2],["Rudy Gay",16.65,5.41,1.67,1.17,0.87],["Ryan Humphrey",2.64,2.41,0.24,0.33,0.05],["Shane Battier",10.51,4.82,1.74,1.28,1.04],["Shareef Abdur-Rahim",20.4,9.6,3.2,1.1,1.05],["Stromile Swift",8.69,4.83,0.55,0.7,1.37],["Tarence Kinsey",6.94,1.83,0.77,0.95,0],["Theron Smith",2.2,2.1,0.4,0.3,0.3],["Tony Massenburg",5.08,4.23,0.32,0.32,0.44],["Wesley Person",9.87,2.55,1.64,0.54,0.26],["Will Solomon",5.2,1.1,1.5,0.6,0.1]]],
    ["MEM","2010s",[["Andrew Harrison",7.43,2.06,2.95,0.69,0.38],["Austin Daye",4,1.9,0.7,0.3,0.5],["Ben McLemore",7.5,2.5,0.9,0.7,0.3],["Beno Udrih",7.04,1.58,2.61,0.53,0.1],["Brandan Wright",6.09,3.19,0.5,0.44,0.89],["Bruno Caboclo",8.3,4.6,1.5,0.4,1],["Chandler Parsons",7.19,2.58,1.74,0.61,0.2],["Chris Andersen",4.6,4.5,0.5,0.7,0.5],["Courtney Lee",10.32,2.44,1.77,0.97,0.28],["Dante Cunningham",5.2,3.8,0.6,0.7,0.5],["Darrell Arthur",7.2,3.65,0.63,0.54,0.66],["DeMarre Carroll",2.77,2.01,0.48,0.37,0.1],["Delon Wright",12.2,5.4,5.3,1.6,0.6],["Deyonta Davis",4.26,3.16,0.42,0.16,0.56],["Dillon Brooks",10.37,2.85,1.47,0.85,0.2],["Ed Davis",5.48,4.21,0.33,0.34,0.92],["Garrett Temple",9.4,3.1,1.4,1,0.5],["Greivis Vásquez",3.6,1,2.2,0.3,0.1],["Hamed Haddadi",1.92,2.06,0.24,0.04,0.5],["Hasheem Thabeet",2.34,2.84,0.16,0.2,0.9],["Ivan Rabb",5.72,4.28,1.02,0.3,0.34],["JaMychal Green",8.43,6.17,1.01,0.61,0.44],["Jamaal Tinsley",3.5,1.7,2.8,0.9,0.1],["James Ennis III",6.35,3.53,0.97,0.67,0.29],["James Johnson",7.4,3.2,2.1,0.8,1.1],["Jarell Martin",6.2,4.02,0.69,0.43,0.48],["Jaren Jackson Jr.",13.8,4.7,1.1,0.9,1.4],["Jeff Green",12.61,4.36,1.8,0.71,0.45],["Jeremy Pargo",2.9,0.8,1.3,0.3,0],["Jerryd Bayless",8.53,2.12,2.96,0.67,0.2],["Jevon Carter",4.4,1.7,1.8,0.7,0.3],["Joakim Noah",7.1,5.7,2.1,0.5,0.7],["Jon Leuer",4.74,2.97,0.52,0.32,0.16],["Jordan Adams",3.12,0.91,0.56,0.56,0.19],["Josh Selby",2.22,0.5,0.92,0.27,0],["Justin Holiday",9.5,3.5,1.4,1.2,0.3],["Kobi Simmons",6.1,1.6,2.1,0.6,0.2],["Kosta Koufos",5.8,5.25,0.5,0.4,0.85],["Kyle Anderson",8,5.8,3,1.3,0.9],["Lance Stephenson",14.2,4.4,2.8,0.7,0.2],["MarShon Brooks",9.23,1.87,1.42,0.55,0.16],["Marc Gasol",15.57,7.78,3.64,0.94,1.52],["Marcus Williams",4.3,1.5,2.6,0.5,0],["Mario Chalmers",9.11,2.49,3.36,1.34,0.2],["Marreese Speights",7.92,5.6,0.68,0.36,0.58],["Matt Barnes",10,5.5,2.1,1,0.8],["Mike Conley",15.83,2.92,6.02,1.58,0.24],["Mike Miller",7.1,2.5,1.6,0.3,0.1],["Nick Calathes",4.59,1.86,2.72,0.99,0.1],["O.J. Mayo",14.01,3.17,2.56,1.11,0.29],["Omri Casspi",6.3,3.2,0.7,0.6,0.3],["Quincy Pondexter",5.21,2.03,0.78,0.43,0.12],["Rudy Gay",19.06,6.1,2.33,1.51,0.85],["Ryan Hollins",3.6,2.7,0.3,0.2,0.6],["Sam Young",6.9,2.4,0.75,0.63,0.28],["Shane Battier",5,4,1.4,0.7,0.4],["Shelvin Mack",7.9,1.9,3.4,0.8,0.1],["Steven Hunter",2.5,2,0,0,0.5],["Tayshaun Prince",6.99,3.41,1.75,0.52,0.28],["Toney Douglas",4.9,2.5,2.3,0.8,0.2],["Tony Allen",8.95,4.24,1.36,1.71,0.48],["Tony Wroten",2.6,0.8,1.2,0.2,0.1],["Troy Daniels",8.2,1.5,0.7,0.3,0.1],["Troy Williams",5.3,1.9,0.8,1,0.4],["Tyler Dorsey",9.8,3.3,1.9,0.3,0],["Tyreke Evans",19.4,5.1,5.2,1.1,0.3],["Vince Carter",6.85,2.52,1.33,0.71,0.34],["Wade Baldwin",3.2,1.4,1.8,0.5,0.2],["Wayne Ellington",5.5,1.3,1.1,0.4,0],["Wayne Selden",7.09,1.43,1.46,0.4,0.14],["Xavier Henry",4.3,1,0.5,0.3,0.1],["Zach Randolph",16.83,10.18,1.97,0.78,0.27]]],
    ["MEM","2020s",[["Derrick Rose",8,1.9,3.3,0.3,0.1],["Taj Gibson",3.4,2.7,0.6,0.2,0.1],["Jonas Valančiūnas",17.1,12.5,1.8,0.6,0.9],["Kentavious Caldwell-Pope",8.6,2.4,2.2,1.1,0.3],["Steven Adams",7.8,10.8,2.8,0.9,1],["Marcus Smart",14.5,2.7,4.3,2.1,0.3],["Kyle Anderson",10,5.5,3.2,1.1,0.8],["Tim Frazier",1.6,1.6,3.2,0.4,0.2],["Tyus Jones",8.4,2.3,4.4,0.9,0.1],["Justise Winslow",6.8,4.5,1.9,0.6,0.5],["Shaquille Harrison",0.7,0.7,0,0,0.3],["Luke Kennard",9.7,2.8,2.8,0.6,0.1],["Dillon Brooks",16.6,3.1,2.6,1.1,0.3],["Grayson Allen",10.6,3.2,2.2,0.9,0.2],["Marvin Bagley III",4.4,2.7,0.4,0.3,0.3],["Jaren Jackson Jr.",18.8,5.9,1.5,1.1,2],["De'Anthony Melton",9.9,3.8,2.6,1.3,0.6],["Jontay Porter",2,1.3,0.1,0.3,0.1],["Yuta Watanabe",3.4,1.6,0.4,0.4,0.2],["DaQuan Jeffries",0.7,0.7,0.3,0,0],["Ja Morant",23.4,4.8,7.6,1,0.3],["Jarrett Culver",3.5,1.3,0.9,0.5,0.1],["Brandon Clarke",9.1,5,1.2,0.8,0.7],["Ty Jerome",19.7,2.8,5.7,1.1,0.3],["Killian Tillie",3.2,1.5,0.5,0.4,0.4],["John Konchar",4.2,4,1.4,0.8,0.4],["Dakota Mathias",1,0.3,0.2,0.2,0],["Shaq Buchanan",1,1,1,0.5,0],["Cole Anthony",9.4,3,2.9,0.7,0.5],["Tyrell Terry",1,0,0,0,0],["Lamar Stevens",5.8,2.8,0.6,0.4,0.4],["Xavier Tillman",6.1,4.1,1.4,0.9,0.5],["Desmond Bane",18.1,4.2,3.6,0.9,0.4],["Sam Merrill",4.2,1.2,0.7,0,0],["Sean McDermott",2.2,1.1,0.2,0.1,0.2],["Jon Teske",0,0.7,0.3,0.3,0],["Ziaire Williams",7.3,2.6,1.1,0.6,0.2],["Matt Hurt",4,2,0.5,0.4,0.4],["Yves Pons",1.1,1,0.1,0.1,0.3],["Santi Aldama",10.1,5.3,2,0.6,0.6],["Scotty Pippen Jr.",11.4,2.9,4.6,1.6,0.4],["DeJon Jarreau",6.4,4.8,3.1,0.8,0.4],["Jay Huff",6.9,2,0.6,0.3,0.9],["Jordan Goodwin",6.5,4.4,2.7,0.8,0.3],["Kennedy Chandler",2.2,1.1,1.6,0.3,0.1],["Tyler Burton",10.8,4.2,1,0.9,0.3],["Jake LaRavia",6.9,2.8,1.1,0.6,0.2],["David Roddy",6.7,2.8,0.8,0.4,0.3],["Vince Williams Jr.",6.2,3.4,1.9,0.6,0.4],["Kenneth Lofton Jr.",5,2.1,0.8,0.2,0.1],["Lucas Williamson",10.4,5.4,2.6,1.6,0.1],["Jacob Gilyard",3,4,7,3,0],["Taylor Hendricks",7.4,3.7,0.9,0.8,0.5],["Rayan Rupert",5.2,2.9,1.1,0.9,0.1],["GG Jackson",11.4,3.9,1.2,0.5,0.5],["Dariq Whitehead",16.3,4,1.5,0.7,0],["Zach Edey",11.4,9.7,1.1,0.6,1.6],["Olivier-Maxence Prosper",10,3.5,1,0.8,0.2],["Timmy Allen",2.6,3.4,1,0.8,0],["Maozinha Pereira",6.9,5.3,0.3,0.9,0.6],["Trey Jemison III",6.8,5.4,1.1,0.5,1.1],["Cam Spencer",7.7,1.9,3.5,0.6,0.1],["Jaylen Wells",11.4,3.3,1.6,0.8,0.1],["Adama Bal",10.4,3.1,2.4,1.1,0.1],["Walter Clayton Jr.",7.8,2,4,0.6,0.3],["Zyon Pullin",0,0,0,0,0],["Yuki Kawamura",1.6,0.5,0.9,0.1,0],["Cedric Coward",13.6,5.9,2.8,0.6,0.4],["Javon Small",9.7,3.1,3.7,0.8,0.2],["Jahmai Mashack",6.2,2.6,2.2,1.2,0.5],["Lawson Lovering",7,7.5,1.5,1.5,0.5],["Toby Okani",10,3.5,1,0.7,0.5]]],
    ["MIA","1980s",[["Billy Thompson",10.8,7.2,2.2,0.7,1.3],["Craig Neal",2.8,0.6,2.7,0.5,0.1],["Grant Long",11.9,6.7,1.8,1.5,0.6],["John Shasky",5.5,3.6,0.3,0.2,0.2],["Jon Sundvold",10.4,1.3,2,0.4,0],["Kevin Edwards",13.8,3.3,4.4,1.8,0.3],["Pat Cummings",8.8,5.3,0.9,0.5,0.3],["Pearl Washington",7.6,2.3,4.2,1.4,0.1],["Rony Seikaly",10.9,7,0.7,0.6,1.2],["Rory Sparrow",12.5,2.7,5.4,1.3,0.2],["Scott Hastings",5.1,3.1,0.8,0.4,0.6],["Sylvester Gray",8,5.2,2.1,0.7,0.5]]],
    ["MIA","1990s",[["Alan Ogg",2.16,1.66,0.16,0.14,0.78],["Alec Kessler",5.15,3.59,0.38,0.17,0.32],["Alonzo Mourning",20.7,10.18,1.64,0.82,2.86],["Billy Owens",14.48,7.2,3.46,0.99,0.47],["Billy Thompson",8.98,5.7,1.81,0.56,0.91],["Bimbo Coles",9.11,2.4,4.42,1.05,0.16],["Blue Edwards",3.2,1.4,1.3,0.7,0.2],["Brad Lohaus",4.4,1.7,0.7,0.3,0.4],["Brian Shaw",7.91,3.87,4.1,0.85,0.3],["Chris Gatling",15.2,7.3,0.7,0.7,0.5],["Clarence Weatherspoon",8.1,5,0.7,0.6,0.3],["Dan Majerle",7.97,4.07,2.71,1.01,0.22],["Danny Schayes",3.2,2.8,0.3,0.3,0.5],["Duane Causwell",2.37,2.39,0.1,0.13,0.67],["Ed Pinckney",2.4,2.4,0.2,0.3,0.3],["Eric Murdock",6.2,1.9,2.7,1.3,0.2],["Gary Grant",3.9,1.4,1.6,0.6,0],["Glen Rice",19.34,4.95,2.23,1.2,0.33],["Grant Long",11.55,7.02,2.19,1.4,0.46],["Harold Miner",9.62,2.32,1.3,0.45,0.13],["Isaac Austin",10.86,5.99,1.39,0.62,0.58],["Jamal Mashburn",14.51,5.39,3.08,1,0.22],["John Crotty",4.8,1,2.1,0.4,0],["John Morton",4.4,0.9,1.3,0.6,0],["John Salley",7.7,5.24,1.68,0.64,1.14],["Jon Sundvold",5.56,0.88,1.41,0.36,0],["Keith Askins",3.81,2.94,0.77,0.56,0.34],["Kevin Edwards",11.75,2.94,2.79,1.5,0.38],["Kevin Gamble",7.22,1.75,1.65,0.7,0.1],["Kevin Willis",14.2,9.94,1.05,0.69,0.5],["Khalid Reeves",9.2,2.8,4.3,1.1,0.1],["Kurt Thomas",8.47,5.9,0.58,0.62,0.5],["Ledell Eackles",7.3,1.8,1.3,0.4,0],["Mark Strickland",4.62,2.88,0.31,0.26,0.48],["Marty Conlon",3.84,2.07,0.53,0.36,0.24],["Matt Geiger",6.95,4.31,0.49,0.49,0.51],["P.J. Brown",10,8.1,1.3,0.98,1.19],["Pat Cummings",4.7,2.5,0.4,0.3,0.1],["Pete Myers",4.7,1.9,2.5,0.4,0.3],["Rex Chapman",14,2.6,3,0.8,0.2],["Rex Walters",2.7,1.24,1.4,0.26,0.1],["Rony Seikaly",16.32,11.09,1.46,0.74,1.43],["Rory Sparrow",5.9,1.7,3.6,0.6,0],["Sasha Danilović",11.94,2.4,2.01,0.87,0.2],["Scott Haffner",4.6,1.2,1.9,0.3,0],["Sherman Douglas",16.01,2.64,7.89,1.72,0.1],["Steve Smith",15.29,3.93,5.05,1.04,0.34],["Tellis Frank",9.5,5,1.1,0.7,0.4],["Terrence Rencher",3,1.2,1.6,0.5,0],["Terry Davis",5.07,4.16,0.54,0.35,0.45],["Terry Mills",4.29,3.02,0.78,0.41,0.2],["Terry Porter",10.5,2.8,2.9,1,0.2],["Tim Hardaway",18.87,3.47,8.4,1.71,0.15],["Tony Smith",4.4,1.6,2.7,0.6,0.2],["Tyrone Corbin",4.6,3,1,0.7,0.1],["Voshon Lenard",11.11,2.94,1.93,0.6,0.16],["Walt Williams",12,4,2.3,1.1,0.6],["Willie Anderson",3,1.5,1.2,0.5,0.1],["Willie Burton",10.08,3.19,1.26,0.65,0.42]]],
    ["MIA","2000s",[["A.C. Green",4.5,3.8,0.5,0.4,0.1],["Alexander Johnson",4.2,2.2,0.3,0.3,0.2],["Alonzo Mourning",12.7,6.65,0.76,0.31,2.66],["Anthony Carter",5.52,2.34,4.32,1.06,0.1],["Anthony Mason",16.1,9.6,3.1,1,0.3],["Antoine Walker",10.4,4.71,1.85,0.6,0.3],["Bimbo Coles",1.3,0.5,0.7,0.1,0],["Brian Grant",10.97,8.52,1.31,0.73,0.61],["Bruce Bowen",6.98,2.8,1.38,0.88,0.55],["Caron Butler",12.51,4.96,2.33,1.47,0.31],["Cedric Ceballos",6.9,3,0.5,0.4,0.1],["Chris Gatling",6.4,3.8,0.5,0.3,0.2],["Chris Quinn",5.64,1.32,2.23,0.54,0.04],["Christian Laettner",5.3,2.7,0.8,0.7,0.3],["Clarence Weatherspoon",7.2,5.8,1.2,0.7,0.6],["Daequan Cook",8.97,2.72,1.08,0.46,0.14],["Damon Jones",11.6,2.8,4.3,0.5,0.1],["Dan Majerle",6.3,4.06,2.44,1.17,0.24],["Derek Anderson",5.8,2.6,2.1,0.3,0.1],["Dorell Wright",5.95,3.91,1.2,0.58,0.63],["Duane Causwell",2.54,2.34,0.16,0.21,0.6],["Dwyane Wade",25.18,4.88,6.67,1.82,0.97],["Earl Barron",4.92,3.05,0.4,0.29,0.15],["Eddie House",6.95,1.47,1.54,0.61,0.04],["Eddie Jones",16.01,4.5,2.99,1.31,0.65],["Gary Payton",6.6,2.44,3.11,0.76,0.05],["Jamaal Magloire",2.9,4,0.4,0.2,0.5],["Jamal Mashburn",17.5,5,3.9,1,0.2],["Jamario Moon",7.1,4.5,1,0.8,0.6],["James Jones",4.2,1.6,0.5,0.3,0.4],["James Posey",7.46,4.9,1.3,0.9,0.3],["Jason Kapono",7.96,2.14,0.98,0.38,0.04],["Jason Williams",10.59,2.19,4.92,1.04,0.07],["Jermaine O'Neal",13,5.4,2,0.4,2],["Jim Jackson",10.7,5.3,2.5,0.8,0.3],["Joel Anthony",2.55,3.24,0.32,0.33,1.37],["John Wallace",4.3,1.6,0.4,0.1,0.2],["Kendall Gill",5.7,2.8,1.5,0.7,0.1],["Keyon Dooling",5.2,1.2,1.8,0.5,0.1],["LaPhonso Ellis",6.15,3.66,0.57,0.41,0.46],["Lamar Odom",17.1,9.7,4.1,1.1,0.9],["Loren Woods",3.2,3.5,0.3,0.3,0.5],["Malik Allen",7.23,4.18,0.6,0.41,0.84],["Marcus Banks",5.56,1.41,2.09,0.56,0.23],["Mario Chalmers",10,2.8,4.9,2,0.1],["Mark Blount",7.41,3.42,0.51,0.41,0.48],["Mark Strickland",4.9,2.4,0.4,0.3,0.3],["Michael Beasley",13.9,5.4,1,0.5,0.5],["Michael Doleac",3.72,2.97,0.48,0.3,0.28],["Mike James",6.99,1.74,2.89,0.74,0.1],["Otis Thorpe",5.5,3.3,0.6,0.5,0.2],["P.J. Brown",9.6,7.5,1.8,0.8,0.8],["Rafer Alston",10.2,2.8,4.5,1.4,0.2],["Rasual Butler",6.97,2.2,1,0.28,0.45],["Rex Walters",2.8,1.1,2,0.2,0],["Ricky Davis",13.08,4.04,3.26,1.07,0.21],["Rod Strickland",10.4,3.1,6.1,1.1,0.1],["Rodney Buford",4.3,1.4,0.6,0.3,0.2],["Samaki Walker",3.2,3.4,0.2,0.3,0.3],["Sean Lampley",4.8,2.4,0.9,0.2,0.1],["Sean Marks",3.4,2.5,0.24,0.2,0.4],["Shandon Anderson",3.35,2.39,0.89,0.52,0.16],["Shaquille O'Neal",19.57,9.05,2.12,0.43,1.87],["Shawn Marion",12.63,9.39,1.99,1.54,1.04],["Tim Hardaway",14.3,2.72,6.74,1.08,0.1],["Travis Best",8.4,2,3.5,0.6,0.1],["Udonis Haslem",10.03,8.07,1.16,0.62,0.33],["Vladimir Stepania",5,5.62,0.25,0.51,0.59],["Voshon Lenard",11.9,2.9,2.6,0.8,0.3],["Wang Zhizhi",2.57,0.94,0.22,0.2,0.18],["Wayne Simien",3.32,1.91,0.25,0.3,0],["Yakhouba Diawara",3.4,1.3,0.4,0.2,0.1]]],
    ["MIA","2010s",[["Amar'e Stoudemire",5.8,4.3,0.5,0.3,0.8],["Bam Adebayo",7.99,6.48,1.88,0.72,0.71],["Beno Udrih",4.4,1.8,2.5,0.3,0],["Carlos Arroyo",5.9,1.72,2.65,0.42,0.06],["Chris Andersen",5.59,4.77,0.46,0.39,1.1],["Chris Bosh",18.01,7.33,1.79,0.87,0.87],["Daequan Cook",5,1.8,1,0.3,0.2],["Danny Granger",6.3,2.7,0.6,0.4,0.2],["Derrick Jones Jr.",6.38,3.7,0.56,0.69,0.68],["Derrick Williams",5.9,2.9,0.6,0.4,0.2],["Dexter Pittman",2.76,1.96,0.26,0.17,0.17],["Dion Waiters",14.03,2.87,3.62,0.8,0.3],["Dorell Wright",7.1,3.3,1.3,0.7,0.4],["Dwyane Wade",20.99,4.62,4.85,1.41,0.77],["Eddie House",6.5,1.6,1.1,0.6,0.1],["Erick Dampier",2.5,3.5,0.4,0.3,0.9],["Gerald Green",8.9,2.4,0.8,0.6,0.3],["Goran Dragić",16.74,3.75,5.36,0.98,0.19],["Greg Oden",2.9,2.3,0,0.3,0.6],["Hassan Whiteside",14.05,11.9,0.62,0.64,2.42],["Henry Walker",7.3,3.4,1.2,1,0.4],["Jamaal Magloire",2.03,3.4,0.07,0.27,0.23],["James Ennis III",4.77,2.67,0.78,0.38,0.29],["James Johnson",10.74,4.44,3.38,0.89,0.8],["James Jones",4.28,1.36,0.44,0.29,0.18],["Jermaine O'Neal",13.6,6.9,1.3,0.4,1.4],["Joe Johnson",13.4,2.8,3.6,0.9,0.1],["Joel Anthony",2.31,3.02,0.2,0.28,1.13],["Jordan Mickey",4,3.5,0.4,0.3,0.4],["Josh McRoberts",4.08,2.77,2.01,0.49,0.2],["Josh Richardson",12.13,3.19,2.88,1.14,0.67],["Justin Hamilton",3,1.77,0.39,0.37,0.15],["Justise Winslow",8.95,5.32,2.68,0.97,0.36],["Juwan Howard",2.17,1.9,0.44,0.15,0.06],["Kelly Olynyk",10.74,5.19,2.24,0.75,0.5],["LeBron James",26.91,7.56,6.73,1.69,0.64],["Luke Babbitt",4.43,1.96,0.48,0.27,0.2],["Luol Deng",13.14,5.61,1.9,0.95,0.35],["Mario Chalmers",8.62,2.38,3.61,1.4,0.17],["Michael Beasley",11.47,4.83,1.12,0.73,0.51],["Mike Bibby",7.3,2.2,2.5,0.5,0.1],["Mike Miller",5.4,3.4,1.38,0.43,0.1],["Norris Cole",6.24,1.79,2.59,0.79,0.09],["Okaro White",2.87,2.23,0.56,0.29,0.29],["Quentin Richardson",8.9,4.9,1.2,0.9,0.2],["Rafer Alston",6.6,2.2,2.9,0.9,0.2],["Rashard Lewis",4.83,1.99,0.76,0.66,0.2],["Ray Allen",10.28,2.75,1.84,0.75,0.15],["Rodney McGruder",6.74,3.26,1.56,0.54,0.2],["Roger Mason",3,0.9,0.8,0.2,0],["Shabazz Napier",5.1,2.2,2.5,0.8,0.1],["Shane Battier",5.17,2.19,1.06,0.76,0.6],["Shawne Williams",6.6,3.2,0.8,0.5,0.4],["Terrel Harris",3.07,2.06,0.98,0.3,0.08],["Toney Douglas",4.2,2.3,1.8,0.5,0.1],["Tyler Johnson",10.97,3.3,2.45,0.94,0.49],["Udonis Haslem",5.09,5.29,0.55,0.33,0.24],["Wayne Ellington",10.51,2.4,1.07,0.71,0.1],["Willie Reed",5.3,4.7,0.4,0.3,0.7],["Zydrunas Ilgauskas",5,4,0.4,0.3,0.8]]],
    ["MIA","2020s",[["Udonis Haslem",3.5,1.5,0.1,0.1,0.1],["Andre Iguodala",4.4,3.5,2.3,0.9,0.6],["Trevor Ariza",9.4,4.8,1.8,1,0.6],["Kyle Lowry",12.3,4.3,6.3,1.1,0.3],["P.J. Tucker",7.6,5.5,2.1,0.8,0.2],["Kevin Love",7.4,5.5,1.7,0.4,0.2],["Goran Dragic",13.4,3.4,4.4,0.7,0.2],["Patty Mills",4,1.1,1.1,0.6,0],["Nemanja Bjelica",6.5,3.4,1.9,0.4,0.1],["Alec Burks",7.3,2.5,1.1,0.6,0.1],["Markieff Morris",7.6,2.6,1.4,0.4,0.1],["Jimmy Butler",21.6,6,5.7,1.7,0.3],["Meyers Leonard",3.3,2.3,0.7,0,0],["Cody Zeller",6.5,4.3,0.7,0.2,0.3],["Dewayne Dedmon",6.7,5.6,0.8,0.5,0.5],["Victor Oladipo",14.3,3.6,3.9,1.1,0.3],["Kyle Anderson",5.9,3.4,2.4,0.7,0.5],["Andrew Wiggins",16.7,4.7,2.7,1.1,0.9],["Delon Wright",4.5,1.8,2.5,1.1,0.2],["Terry Rozier",15.2,3.9,4.1,0.8,0.2],["Norman Powell",21.7,3.5,2.5,1.1,0.2],["Josh Richardson",7,2.1,1.9,0.8,0.2],["Bam Adebayo",19.3,9.7,3.9,1.2,0.8],["Thomas Bryant",5.7,3.7,0.6,0.3,0.4],["Mychal Mulder",4.1,1.4,0.3,0.2,0.1],["Caleb Martin",9.6,4.3,1.6,0.9,0.5],["Duncan Robinson",10.9,2.5,1.9,0.5,0.2],["Kendrick Nunn",14.6,3.2,2.6,0.9,0.3],["Gabe Vincent",7.6,1.7,2.3,0.7,0.1],["Haywood Highsmith",4.8,2.9,0.9,0.6,0.4],["Max Strus",9.4,2.4,1.4,0.4,0.2],["Tyler Herro",20.2,5.1,4.3,0.7,0.2],["KZ Okpala",3.1,1.9,0.6,0.2,0.3],["Kyle Guy",3.9,0.9,0.9,0.4,0.1],["Chris Silva",2.6,3.6,0.7,0,0.1],["Precious Achiuwa",5,3.4,0.5,0.3,0.5],["R.J. Hampton",1.3,0.8,1,0,0],["Omer Yurtseven",4.8,4,0.6,0.2,0.3],["Josh Christopher",2,0.6,0.6,0.4,0.2],["Davion Mitchell",8.6,2.5,5.7,1,0.2],["Marcus Garrett",1.1,1.9,0.6,0.4,0.3],["Javonte Smart",3,1.4,0.9,0.4,0.2],["Dru Smith",5.4,2.2,1.9,1.3,0.3],["Nikola Jović",7.8,3.4,1.9,0.6,0.3],["Orlando Robinson",3.2,3.2,0.9,0.3,0.3],["Jamaree Bouyea",3,1.2,0.8,0.8,0.4],["Jaime Jaquez Jr.",12,4.4,3.3,0.9,0.3],["Trevor Keels",1,0.3,0,0.1,0],["Alondes Williams",0.7,0.1,0,0,0.1],["Jamal Cain",4.6,2.1,0.6,0.5,0.2],["Cole Swider",2.3,0.4,0.3,0.1,0.1],["Simone Fontecchio",8.5,3,1.4,0.5,0.1],["Pelle Larsson",8,2.6,2.3,0.6,0.2],["Isaiah Stevens",0,0.7,0,0.3,0],["Myron Gardner",3.6,2.7,1,0.4,0.2],["Kel'el Ware",10.2,8.2,0.8,0.7,1.1],["Keshad Johnson",3.5,1.9,0.3,0.4,0.3],["Jahmir Young",1.8,0.3,0.6,0.1,0],["Kasparas Jakučionis",6.2,2.6,2.6,0.6,0.1],["Vladislav Goldin",0.8,1,0.3,0,0.3]]],
    ["MIL","1960s",[["Dave Gambee",12.1,5.3,0.9,null,null],["Dick Cunningham",4.6,5.7,0.8,null,null],["Flynn Robinson",20.3,3.6,4.9,null,null],["Fred Hetzel",15.9,8.9,1.6,null,null],["Greg Smith",8.1,10.2,1.7,null,null],["Guy Rodgers",10.3,2.8,6.9,null,null],["Jon McGlocklin",19.6,4.3,3.9,null,null],["Len Chappell",14.6,8,1.2,null,null],["Sam Williams",4.1,2,1.1,null,null],["Wayne Embry",13.1,8.6,1.9,null,null],["Zaid Abdul-Aziz",11,13,1.1,null,null]]],
    ["MIL","1970s",[["Alex English",7.74,3.95,1.09,0.42,0.53],["Bill Dinwiddie",1.6,1.4,0.4,null,null],["Bill Zopf",2.2,0.9,1.4,null,null],["Bob Boozer",9.1,5.4,1.6,null,null],["Bob Dandridge",18.83,7.38,3.18,1.5,0.53],["Bob Greacen",2.6,1.47,0.97,null,null],["Brian Winters",19.31,2.87,4.68,1.45,0.37],["Chuck Terry",1.82,2.03,0.6,0.3,0],["Clyde Mayes",4.4,4,0.6,0.1,0.6],["Cornell Warner",7,8.19,1.32,0.51,0.65],["Curtis Perry",8.53,9.18,1.95,1.3,1.2],["Dave Meyers",10.86,6.55,2.11,0.99,0.49],["Dick Cunningham",2.24,2.97,0.52,0.24,0.24],["Elmore Smith",13.41,9.79,1.11,0.88,2.77],["Ernie Grunfeld",8.7,3.6,2.32,0.7,0.25],["Flynn Robinson",21.8,3.2,5.5,null,null],["Fred Carter",8.3,2,2.2,0.6,0.1],["Freddie Crawford",7.6,2.4,2.9,null,null],["Gary Brokaw",8.39,1.79,3.05,0.46,0.29],["Gary Freeman",3.7,2.4,0.8,null,null],["George Johnson",6.2,5.4,1.2,1.1,0.7],["George Thompson",10.7,2.5,3.1,0.9,0.1],["Greg Smith",10.41,7.64,2.34,null,null],["Guy Rodgers",3.2,1.2,3.3,null,null],["Jeff Webb",1.92,0.84,0.58,null,null],["Jim Fox",3.9,3.4,0.6,0.4,0.2],["Jim Price",12.57,3.41,4.95,1.96,0.42],["John Block",8.5,5.2,1.2,null,null],["John Gianelli",7.8,5.6,2.15,0.6,0.9],["Jon McGlocklin",11.53,2.13,3.14,0.49,0.08],["Junior Bridgeman",13.04,3.95,2.13,0.9,0.38],["Kareem Abdul-Jabbar",30.43,15.32,4.31,1.22,3.41],["Kent Benson",10.2,5.82,2,1.05,0.91],["Kevin Restani",5.99,4.65,1.41,0.43,0.22],["Len Chappell",8.3,3.7,0.7,null,null],["Lloyd Walton",4.74,1.15,3.66,0.95,0.11],["Lucius Allen",13.82,3.33,4.44,1.84,0.28],["Marques Johnson",22.49,9.13,2.69,1.35,1.25],["McCoy McLemore",4.23,3.69,1.13,null,null],["Mickey Davis",5.17,2.83,1.05,0.37,0.09],["Norm Van Lier",2.8,1.1,4.2,1.1,0.1],["Oscar Robertson",16.34,4.93,7.47,1.1,0.1],["Quinn Buckner",8.37,2.96,5.37,2.2,0.23],["Ron Williams",5.08,0.96,1.92,0.62,0],["Rowland Garrett",4.7,2.2,0.6,0.4,0.2],["Russ Lee",2.62,0.99,0.71,0.3,0],["Scott Lloyd",5.18,2.81,0.52,0.28,0.23],["Steve Kuberski",2.8,2.1,0.6,0.2,0.1],["Swen Nater",13,12,1.5,0.8,0.7],["Terry Driscoll",4,3.81,0.8,0.27,0.26],["Toby Kimball",3.5,4.2,0.8,null,null],["Wali Jones",6.6,1.42,2.61,null,null],["Walt Wesley",2.1,1.3,0.3,0.2,0.1],["Zaid Abdul-Aziz",7.4,7.5,0.8,null,null]]],
    ["MIL","1980s",[["Alton Lister",8.05,6.93,1.32,0.5,1.86],["Bob Lanier",13.53,5.87,2.73,1,0.87],["Brian Winters",13.75,2.4,3.71,1.02,0.19],["Charles Davis",6.76,2.71,0.94,0.45,0.1],["Charlie Criss",6.1,1.23,1.98,0.43,0],["Craig Hodges",10.48,1.84,3.47,1.04,0.03],["Dave Cowens",8.1,6.9,2.1,0.8,0.4],["Dave Meyers",12.1,5.7,2.8,0.9,0.5],["Dudley Bradley",3.01,1.47,0.99,1.46,0.1],["Fred Roberts",5.9,2.9,0.9,0.5,0.3],["Geoff Crompton",0.8,1.2,0.4,0.2,0.3],["Harvey Catchings",3.16,5.15,1.05,0.4,1.93],["Jack Sikma",14.21,8.81,3.16,1.1,0.97],["Jay Humphries",9.84,2.34,4.87,1.74,0.1],["Jeff Lamp",6.3,2.8,1.5,0.5,0.1],["Jerry Reynolds",6.32,2.39,1.7,0.97,0.44],["John Lucas",12.08,2.31,5.46,1.31,0.03],["John Stroeder",1.9,1.7,0.5,0.1,0.3],["Junior Bridgeman",14.68,3.5,2.83,0.83,0.2],["Keith Smith",3.3,0.8,1,0.6,0.1],["Kenny Fields",5.31,2.15,0.86,0.5,0.19],["Kent Benson",8.8,5.9,2.3,1,1.3],["Kevin Grevey",6.51,1.3,1.2,0.4,0.05],["Larry Krystkowiak",10.58,6.45,1.18,0.89,0.14],["Len Elmore",2.9,2.9,1,0.5,0.7],["Lloyd Walton",3.6,1.2,3.8,0.6,0],["Lorenzo Romar",5.68,1.32,2.86,0.75,0.09],["Mark Davis",4,1.2,0.5,0.4,0.2],["Marques Johnson",20.29,6.79,4.12,1.35,0.66],["Mickey Johnson",12.64,6.23,3.11,0.97,0.74],["Mike Dunleavy",9.54,1.52,4.31,0.71,0.14],["Mike Evans",4.42,1.15,2.27,0.52,0.08],["Mike Glenn",5.97,1.4,0.93,0.21,0.09],["Pace Mannion",3.5,1.5,1.6,0.4,0.2],["Pat Cummings",7.03,3.46,0.94,0.33,0.2],["Paul Mokeski",3.69,3.14,0.65,0.31,0.34],["Paul Pressey",12,4.46,5.8,1.59,0.68],["Phil Ford",6.8,1.4,3.6,0.7,0],["Quinn Buckner",12.38,3.6,5.01,2.31,0.03],["Randy Breuer",7.21,4.41,0.82,0.46,1.05],["Richard Washington",5.9,3.7,0.7,0.3,0.6],["Rickey Green",5.4,1.5,3.5,0.7,0.1],["Ricky Pierce",15.9,2.84,2.04,0.88,0.21],["Scott May",9,3.4,2,0.8,0.1],["Sidney Moncrief",16.68,4.98,3.85,1.25,0.31],["Steve Mix",6,2.4,1.2,0.6,0.1],["Terry Cummings",21.67,8.31,2.6,1.39,0.78],["Tiny Archibald",7.4,1.7,3.5,0.7,0],["Tito Horford",1.7,0.9,0.1,0,0.3],["Tony Brown",3.2,1,0.7,0.4,0.1]]],
    ["MIL","1990s",[["Alton Lister",2.65,3.92,0.24,0.27,0.94],["Alvin Robertson",12.72,5.33,4.97,2.67,0.26],["Andrew Lang",3.94,3.94,0.4,0.4,0.69],["Anthony Avent",9.11,5.77,1.07,0.64,0.81],["Anthony Cook",2.7,2.4,0.2,0.1,0.5],["Armen Gilliam",9.64,5.43,0.93,0.77,0.48],["Ben Coleman",5.7,4,0.5,0.3,0.3],["Benoit Benjamin",7.8,6.2,0.7,0.5,1],["Blue Edwards",14.25,4.35,2.35,1.3,0.4],["Brad Lohaus",6.72,3.38,1.26,0.59,0.96],["Chris Gatling",6.3,3.8,0.7,0.8,0.2],["Chucky Brown",2.8,2.2,0.4,0.2,0.3],["Dale Ellis",16.44,3.26,1.34,0.72,0.2],["Danny Schayes",6.79,4.58,0.98,0.52,0.53],["David Wood",1.2,0.6,0.3,0.2,0.1],["Dell Curry",10.1,2,1.1,0.9,0.1],["Derek Strong",6.65,4.4,0.67,0.57,0.15],["Ed Pinckney",2.3,3.4,0.3,0.5,0.3],["Elliot Perry",7.01,1.41,2.89,1.14,0],["Eric Mobley",3.64,3.21,0.45,0.2,0.56],["Eric Murdock",14,3.18,6.8,2,0.13],["Ervin Johnson",6.89,7.7,0.59,0.85,1.66],["Frank Brickowski",13.88,5.84,2.46,1.09,0.54],["Frank Kornet",1.93,1.06,0.36,0.2,0.06],["Fred Roberts",9.64,3.35,1.6,0.73,0.37],["Glenn Robinson",21.08,6.09,2.89,1.24,0.62],["Greg Anderson",6.96,5.2,0.31,0.44,0.72],["Haywoode Workman",6.9,3.5,5.9,1.1,0],["Jack Sikma",12.08,6.28,2.52,0.94,0.75],["Jamie Feick",2.2,2.72,0.38,0.57,0.38],["Jay Humphries",14.87,2.91,6.36,1.74,0.13],["Jeff Grayer",7.7,3.07,1.6,0.7,0.13],["Jerald Honeycutt",6.06,2.25,0.83,0.49,0.19],["Joe Wolf",1.7,2,0.4,0.3,0.2],["Johnny Newman",9.07,2.27,1.47,0.93,0.2],["Jon Barry",4.95,1.36,1.84,0.96,0.14],["Ken Norman",11.9,6.1,2.7,0.7,0.6],["Larry Krystkowiak",8.66,5.3,1.43,0.68,0.18],["Lee Mayberry",5.35,1.17,3.25,0.68,0.05],["Lester Conner",3.3,2.01,3.31,1.2,0.07],["Litterial Green",1.2,0.3,0.8,0.2,0],["Marty Conlon",7.72,3.87,1.11,0.41,0.15],["Michael Curry",5.96,1.58,1.66,0.74,0.16],["Moses Malone",14.29,8.52,1.04,0.81,0.79],["Paul Pressey",11,3,4.3,1.2,0.4],["Randolph Keys",3.4,1.8,0.9,0.5,0.2],["Randy Breuer",6.8,4.2,0.4,0.3,1.1],["Ray Allen",16.6,4.39,3.49,1.14,0.1],["Ricky Pierce",17.67,2.27,1.86,0.64,0.1],["Robert Traylor",5.3,3.7,0.8,0.9,0.9],["Shawn Respert",4.26,1.07,1.01,0.41,0.08],["Sherman Douglas",10.54,2.35,5.59,0.95,0.1],["Steve Henson",3.06,0.8,1.77,0.42,0],["Terrell Brandon",16.04,3.5,7.52,2.06,0.28],["Terry Cummings",8,5.5,1.1,0.7,0.4],["Tim Thomas",8.5,2.8,0.9,0.7,0.3],["Tito Horford",1.5,1.7,0.1,0.1,0.5],["Todd Day",14.05,3.99,1.63,1.25,0.72],["Tony Brown",3.6,1.2,0.7,0.5,0.1],["Tyrone Hill",9.68,10.06,1.39,1.18,0.5],["Vin Baker",18.29,9.52,2.73,0.87,1.32],["Vinny Del Negro",5.9,2.1,3.6,0.7,0.1]]],
    ["MIL","2000s",[["Andrew Bogut",11.91,8.74,2.52,0.68,1.02],["Anthony Goldwire",6.4,2.1,3.3,0.6,0],["Anthony Mason",8.54,7.24,3.76,0.61,0.26],["Awvee Storey",3.5,2.1,0.6,0.3,0],["Bobby Simmons",10.6,3.82,1.72,0.91,0.2],["Brevin Knight",5.9,2.3,4.7,1.4,0],["Brian Skinner",7.18,6.43,0.9,0.39,1.05],["Charlie Bell",9.7,2.36,2.65,0.93,0.05],["Charlie Villanueva",13.54,6.28,1.3,0.52,0.54],["Damir Markota",1.7,1,0.2,0.1,0],["Damon Jones",6.06,1.78,4.83,0.36,0],["Dan Gadzuric",5.01,4.63,0.38,0.48,0.9],["Daniel Santiago",3.66,2.28,0.35,0.38,0.4],["Danny Manning",4.6,2.9,1,0.9,0.4],["Darvin Ham",4.4,3.7,1.03,0.55,0.62],["David Noel",2.7,1.8,1,0.4,0.1],["Desmond Mason",14.23,4.47,2.26,0.7,0.36],["Earl Boykins",14,2.2,4.5,0.9,0],["Erick Strickland",5.1,1.7,1.98,0.54,0],["Ersan İlyasova",6.1,2.9,0.7,0.4,0.3],["Ervin Johnson",3.1,6.22,0.41,0.6,1.13],["Francisco Elson",3.4,3.9,0.5,0.6,0.6],["Gary Payton",19.6,3.1,7.4,1.4,0.3],["Glenn Robinson",21.22,6.37,2.74,1.18,0.63],["Greg Anthony",7.2,1.8,3.3,1.2,0],["Haywoode Workman",2.9,0.7,1.9,0.5,0],["J.R. Reid",4.4,3.4,0.5,0.6,0.1],["Jake Voskuhl",2.2,2.2,0.3,0.2,0.5],["Jamaal Magloire",9.2,9.5,0.7,0.4,1],["Jared Reiner",1.2,2.6,0.5,0.2,0.2],["Jason Caffey",6.19,4.02,0.72,0.42,0.33],["Jermaine Jackson",1.2,0.9,0.8,0.1,0],["Jerome Kersey",3.3,2,0.7,0.6,0.4],["Jiří Welsch",4.3,1.9,1.1,0.6,0],["Joe Alexander",4.7,1.9,0.7,0.3,0.5],["Joe Smith",10.42,7.29,0.89,0.58,0.73],["Joel Przybilla",1.89,3.62,0.29,0.24,1.38],["Keith Bogans",6,3.1,1.1,0.7,0.1],["Keith Van Horn",12.68,5.56,1.33,0.6,0.43],["Kevin Ollie",5.7,1.9,3.4,0.7,0.1],["Lindsey Hunter",10.1,2.1,2.7,1.2,0.1],["Luc Mbah a Moute",7.2,5.9,1.1,1.1,0.5],["Luke Ridnour",9.6,3,5.1,1.3,0.2],["Lynn Greer",4.1,0.7,1.3,0.4,0],["Malik Allen",3.2,2.1,0.7,0.1,0.2],["Marcus Fizer",6.2,3.2,1.2,0.5,0.2],["Marcus Haislip",3.61,1.53,0.16,0.2,0.46],["Mark Pope",2.19,2.01,0.52,0.26,0.32],["Michael Redd",20.55,4.14,2.29,0.99,0.14],["Michael Ruffin",2,4,0.5,0.7,0.4],["Mike James",11.4,2.6,3.9,0.9,0.1],["Mo Williams",14.08,3.49,5.7,1.07,0.12],["Rafer Alston",2.74,1.09,2.47,0.49,0],["Ramon Sessions",11.64,3.4,6.02,1.08,0.12],["Ray Allen",21.86,4.69,4.01,1.34,0.22],["Reece Gaines",1.24,0.14,0.35,0.15,0.05],["Richard Jefferson",19.6,4.6,2.4,0.8,0.2],["Robert Traylor",3.6,2.6,0.5,0.6,0.6],["Royal Ivey",5.6,1.6,2.1,0.6,0.1],["Ruben Patterson",14.7,5.4,2.9,1.4,0.3],["Sam Cassell",19.04,4.02,7.3,1.2,0.15],["Scott Williams",6.86,6.06,0.45,0.65,0.75],["Steve Blake",3.6,1.4,2.5,0.3,0.1],["T.J. Ford",9.99,3.82,6.56,1.27,0.1],["Tim Thomas",12.57,4.4,1.55,0.89,0.49],["Toni Kukoč",7.71,3.32,2.86,0.83,0.33],["Tyronn Lue",4.7,1.2,1.5,0.2,0],["Vinny Del Negro",5.2,1.6,2.4,0.5,0],["Yi Jianlian",8.6,5.2,0.8,0.5,0.8],["Zaza Pachulia",6.2,5.1,0.8,0.6,0.5]]],
    ["MIL","2010s",[["Andrew Bogut",14.14,10.44,1.95,0.68,2.5],["Beno Udrih",6.22,1.82,3.68,0.52,0.04],["Brandon Jennings",16.48,3.33,5.56,1.44,0.22],["Brandon Knight",17.86,3.84,5.11,1.25,0.2],["Brook Lopez",12.5,4.9,1.2,0.6,2.2],["Carlos Delfino",10.53,4.54,2.47,1.36,0.24],["Caron Butler",11,4.6,1.6,0.7,0.3],["Charlie Bell",6.5,1.9,1.5,0.5,0.2],["Chris Copeland",2.1,0.4,0.5,0.1,0],["Chris Douglas-Roberts",7.3,2,1.1,0.7,0.3],["Corey Maggette",12,3.6,1.3,0.3,0.1],["D.J. Wilson",4.29,3.31,0.79,0.31,0.27],["Dan Gadzuric",2.8,2.9,0.4,0.3,0.4],["DeAndre Liggins",1.8,1.6,0.9,0.9,0.3],["Donte DiVincenzo",4.9,2.4,1.1,0.5,0.2],["Doron Lamb",3.4,0.7,0.9,0.3,0],["Drew Gooden",11.36,5.91,1.85,0.66,0.54],["Earl Boykins",7.2,1,2.5,0.7,0.1],["Ekpe Udoh",4.26,3.59,0.71,0.5,1.15],["Eric Bledsoe",16.81,4.27,5.31,1.74,0.5],["Ersan İlyasova",10.78,6.28,1.12,0.73,0.37],["Gary Neal",10,1.7,1.5,0.2,0],["George Hill",6.8,2.6,2.1,0.9,0.1],["Giannis Antetokounmpo",18.81,8.28,4.12,1.21,1.33],["Greg Monroe",13.28,7.6,2.26,0.97,0.63],["Greivis Vásquez",5.7,2,4,0.4,0],["Hakim Warrick",10.2,4.4,0.7,0.4,0.2],["Jabari Parker",15.27,5.47,2.04,0.95,0.36],["Jared Dudley",7.2,3.1,1.8,1,0.2],["Jason Terry",3.77,1.2,1.26,0.68,0.3],["Jeff Adrien",10.9,7.8,1.1,0.6,0.8],["Jerry Stackhouse",8.5,2.4,1.7,0.5,0.2],["Jerryd Bayless",8.85,2.7,3.04,0.84,0.2],["Jodie Meeks",4.1,1.8,0.5,0.3,0.1],["John Henson",7.81,5.47,1.09,0.46,1.48],["John Salmons",15.72,3.48,3.44,1.03,0.31],["Johnny O'Bryant",2.97,2.43,0.5,0.23,0.1],["Jon Brockman",1.81,2.61,0.3,0.16,0],["Jon Leuer",4.7,2.6,0.5,0.3,0.4],["Kendall Marshall",4.2,1,3.1,0.8,0],["Keyon Dooling",7.1,1.5,3,0.7,0.1],["Khris Middleton",16.29,4.6,3.37,1.34,0.18],["Kurt Thomas",3,4.2,0.7,0.4,0.7],["Larry Sanders",6.5,5.78,0.76,0.65,1.83],["Luc Mbah a Moute",6.73,5.15,0.92,0.83,0.4],["Luke Ridnour",8.97,1.7,3.82,0.67,0.1],["Malcolm Brogdon",12.77,3.51,3.6,0.91,0.23],["Marquis Daniels",5.5,2.5,1.1,0.9,0.2],["Matthew Dellavedova",6.04,1.73,4.21,0.56,0],["Michael Beasley",9.4,3.4,0.9,0.5,0.5],["Michael Carter-Williams",12.32,4.75,5.33,1.66,0.71],["Michael Redd",9.22,2.21,1.84,0.78,0.1],["Mike Dunleavy",11.26,3.82,1.98,0.5,0.33],["Miles Plumlee",4.06,2.96,0.4,0.3,0.62],["Miroslav Raduljica",3.8,2.3,0.5,0.1,0.3],["Mirza Teletović",6.49,2.3,0.74,0.22,0.19],["Monta Ellis",18.87,3.82,5.98,1.96,0.38],["Nate Wolters",6.42,2.42,2.83,0.58,0.25],["O.J. Mayo",10.6,2.54,2.63,0.8,0.28],["Pat Connaughton",6.9,4.2,2,0.5,0.4],["Ramon Sessions",15.8,3.1,4.8,0.6,0.1],["Rashad Vaughn",3.16,1.19,0.58,0.4,0.18],["Samuel Dalembert",6.7,5.9,0.4,0.4,1.1],["Sean Kilpatrick",4,1.1,0.7,0.2,0],["Shaun Livingston",5.5,2.1,2.1,0.5,0.3],["Stephen Jackson",10.5,3.2,3,1,0.2],["Sterling Brown",5.24,2.91,0.97,0.5,0.15],["Thon Maker",4.5,2.59,0.51,0.35,0.59],["Tobias Harris",4.96,2.24,0.5,0.3,0.24],["Tony Snell",7.17,2.38,1.14,0.57,0.27],["Tyler Ennis",4.32,1.42,2.21,0.57,0.04],["Tyler Zeller",5.9,4.6,0.8,0.3,0.6],["Zaza Pachulia",8.05,6.59,2.48,0.97,0.3]]],
    ["MIL","2020s",[["P.J. Tucker",3.7,3.9,1.2,0.8,0.4],["Danilo Gallinari",5.7,2.2,1.1,0.3,0.1],["Brook Lopez",13.2,5.2,1.2,0.6,1.9],["Robin Lopez",1.1,0.3,0.3,0.1,0.2],["Serge Ibaka",5.4,3.7,0.6,0.2,0.5],["George Hill",6.2,2.9,2.2,0.8,0.1],["Goran Dragic",6.3,1.4,2.6,0.2,0.1],["Jrue Holiday",18.4,4.7,6.8,1.5,0.5],["Jeff Teague",6.7,1.6,2.4,0.6,0.2],["Patrick Beverley",6.2,3.3,2.9,0.6,0.4],["Wesley Matthews",4.2,2,0.7,0.5,0.2],["Damian Lillard",24.6,4.6,7,1.1,0.2],["Meyers Leonard",4.8,3.8,0.1,0.2,0],["Jae Crowder",6.6,3.5,1.4,0.8,0.2],["Khris Middleton",17.7,5.1,5.2,1,0.2],["Giannis Antetokounmpo",29.6,11.3,6,1,1.1],["Thanasis Antetokounmpo",2,1.4,0.5,0.3,0.2],["Gary Harris",2.7,1.3,1.1,0.6,0.2],["Langston Galloway",2,2.6,1.7,0.1,0],["Joe Ingles",6.9,2.8,3.3,0.7,0.1],["Myles Turner",11.9,5.3,1.5,0.7,1.6],["Bobby Portis",13.6,8,1.5,0.7,0.4],["Pat Connaughton",7,3.9,1.5,0.6,0.3],["Axel Toupane",1.8,0.8,0.5,0.3,0.4],["Malik Beasley",11.3,3.7,1.4,0.7,0.1],["Taurean Prince",8.7,3.4,1.9,0.8,0.2],["DeAndre' Bembry",5.1,2.9,1.2,0.9,0.4],["Bryn Forbes",10,1.6,0.6,0.3,0],["Justin Jackson",7.2,2.3,1.5,0.4,0.1],["Kyle Kuzma",13.9,5.1,2.5,0.6,0.3],["Grayson Allen",10.8,3.3,1.9,0.8,0.2],["Jevon Carter",6.1,2.1,1.9,0.6,0.3],["Donte DiVincenzo",10.4,5.8,3.1,1.1,0.2],["Gary Trent Jr.",9.6,1.6,1.2,0.8,0.1],["Rodions Kurucs",1.5,1.1,0.5,0.4,0.2],["Elijah Bryant",16,6,3,0,1],["Jaylen Adams",0.3,0.4,0.3,0,0],["Javin DeLaurier",0,1,0,1,0],["Mamadi Diakite",3.1,2.4,0.6,0.4,0.4],["Lindell Wigginton",4.4,0.8,1.1,0.1,0.1],["Kevin Porter Jr.",13.8,4.5,5.4,1.7,0.3],["Jordan Nwora",6.8,2.8,0.6,0.5,0.3],["Rayjon Tucker",4.2,1.6,2,0.8,0],["Cole Anthony",6.7,2.5,3.5,0.6,0.3],["Sam Merrill",3,1,0.7,0.3,0],["Cam Thomas",13.5,1.7,2.6,0.2,0.1],["Sandro Mamukelashvili",3.8,2,0.5,0.2,0.2],["Jericho Sims",3.4,4.6,1.1,0.2,0.3],["Stanley Umude",0.7,0.8,0.2,0.1,0.3],["MarJon Beauchamp",4.8,2.2,0.6,0.3,0.1],["Alex Antetokounmpo",3.2,1,0.2,0,0.2],["TyTy Washington Jr.",1.3,0.5,0.5,0.3,0],["Jamaree Bouyea",3.4,1,2,0.8,0.4],["Ryan Rollins",9,2.5,2.9,1,0.3],["Ousmane Dieng",7.6,3.2,2.4,0.4,0.3],["Pete Nance",4.2,2.2,0.9,0.2,0.2],["AJ Green",6.7,1.9,1.1,0.3,0.1],["Andre Jackson Jr.",2.7,2.1,1,0.4,0.1],["Chris Livingston",1.3,1.4,0.2,0.2,0],["Mark Sears",3.1,0.3,0.3,0,0],["Liam Robbins",0.7,0.9,0.2,0.2,0.2],["Tyler Smith",2.9,1.1,0.2,0.1,0.2],["Cormac Ryan",14.3,2.5,1.7,1,0.3]]],
    ["MIN","1990s",[["Andrae Patterson",3.3,1.9,0.4,0.5,0.2],["Andrew Lang",8.8,6.1,0.2,0.4,2.1],["Anthony Peeler",11.36,3.21,3.32,1.51,0.2],["Bill Curley",2.42,1.74,0.4,0.45,0.25],["Bob McCann",6.3,3.6,0.9,0.6,0.7],["Bobby Jackson",7.1,2.7,3.3,0.8,0.1],["Brad Lohaus",7.5,3.9,2.2,0.5,0.8],["Brad Sellers",2.69,1.48,0.74,0.16,0.2],["Brian Davis",1.9,0.8,0.3,0.2,0.1],["Charles Shackleford",4.5,3.2,0.4,0.4,0.3],["Cherokee Parks",5.24,4.08,0.55,0.5,0.85],["Chris Carr",7.38,2.4,1.22,0.33,0.19],["Chris Smith",5.07,1.28,2.84,0.54,0.23],["Christian Laettner",17.26,8.06,3.25,1.18,1.08],["Chuck Person",14.22,4.46,3.41,0.75,0.3],["Darrick Martin",7.4,1.6,4.2,0.85,0.05],["DeJuan Wheat",1.7,0.3,0.7,0.2,0],["Dean Garrett",6.95,6.42,0.6,0.6,1.19],["Dennis Scott",9.1,1.8,1.5,0.6,0.1],["Donald Royal",5.9,2.1,0.7,0.5,0.1],["Donyell Marshall",10.8,4.9,1.4,0.6,1.3],["Doug West",10.21,2.56,1.98,0.71,0.27],["Eric Riley",3.7,3,0.2,0.3,0.6],["Felton Spencer",5.96,6.57,0.44,0.44,1.24],["Gary Leonard",1.5,1.2,0,0.1,0.4],["Gerald Glass",9.5,2.83,1.71,0.74,0.31],["Greg Foster",4.6,3.4,0.4,0.2,0.3],["Howard Eisley",3.3,1.2,2.3,0.5,0.1],["Isaiah Rider",18.83,3.8,2.89,0.73,0.33],["James Robinson",7.55,1.7,1.88,0.42,0.14],["Jerome Allen",2.6,0.6,1.2,0.5,0.1],["Joe Smith",13.7,8.2,1.6,0.7,1.5],["Kevin Garnett",16.21,8.38,3.25,1.45,1.82],["Lance Blanks",2.6,1.1,1.2,0.3,0.1],["Luc Longley",5.45,4.67,0.86,0.69,1.19],["Malik Sealy",8.1,3,1.2,1,0.2],["Mark Davis",3.3,2.2,0.8,0.7,0.4],["Mark Randall",3.52,1.52,0.69,0.29,0.1],["Marlon Maxey",4.89,3.69,0.24,0.3,0.51],["Marques Bragg",2.5,1.5,0.2,0.3,0.2],["Micheal Williams",12.34,2.93,6.8,1.68,0.27],["Mike Brown",3.03,4.56,0.78,0.53,0.3],["Pat Durham",5.1,1.6,0.9,0.6,0.5],["Pooh Richardson",15,3.27,8.07,1.57,0.27],["Randy Breuer",6.87,4.79,1.27,0.49,1.35],["Reggie Jordan",2.34,1.71,0.99,0.5,0.18],["Richard Coffey",1.3,1.5,0.1,0.1,0.1],["Sam Mitchell",11.59,5.03,1.25,0.7,0.44],["Scott Brooks",5.2,1.05,2.55,0.75,0.1],["Scott Roth",6.8,1.6,1.6,0.7,0.1],["Sean Rooks",9.34,5.38,1.05,0.4,0.79],["Shane Heal",1.7,0.4,0.8,0.1,0.1],["Sidney Lowe",2.3,2,4.2,0.9,0.1],["Spud Webb",9.4,1.5,5.9,1,0.2],["Stacey King",7.02,4.04,0.66,0.55,0.74],["Stanley Roberts",6.2,4.9,0.4,0.3,1],["Stephon Marbury",16.94,2.82,8.35,1.21,0.2],["Stojko Vranković",3.4,3.2,0.3,0.2,1.3],["Tellis Frank",3.03,3.21,0.89,0.5,0.49],["Terrell Brandon",14.2,3.9,9.8,1.9,0.3],["Terry Porter",8.6,2.23,4.13,0.87,0.17],["Thurl Bailey",8.82,3.8,0.8,0.33,0.93],["Tod Murphy",5.68,5.13,0.99,0.6,0.48],["Tom Gugliotta",18.19,8.53,3.82,1.7,1],["Tom Hammonds",5.27,3.88,0.51,0.25,0.21],["Tony Campbell",20.64,4.58,2.76,1.37,0.46],["Tyrone Corbin",16.23,7.24,3.37,1.99,0.55],["Winston Garland",6.1,2.3,4.4,1,0.2]]],
    ["MIN","2000s",[["Al Jefferson",21.8,11.06,1.48,0.86,1.58],["Anthony Carter",2.94,1.16,2.32,0.5,0.26],["Anthony Peeler",9.22,2.7,2.55,0.89,0.15],["Antoine Walker",8,3.7,1,0.7,0.2],["Bobby Brown",5.5,0.8,1.4,0.3,0.1],["Bobby Jackson",5.1,2.1,2.4,0.7,0.1],["Brian Cardinal",3,2.2,1.2,0.6,0.2],["Chauncey Billups",10.95,2.46,4.48,0.75,0.15],["Chris Richard",1.9,2.6,0.3,0.2,0.2],["Corey Brewer",5.86,3.64,1.45,1,0.28],["Craig Smith",8.92,4.52,0.82,0.5,0.23],["Dean Garrett",2.04,2.6,0.26,0.25,0.63],["Eddie Griffin",5.65,5.7,0.67,0.23,1.78],["Ervin Johnson",1.78,3.09,0.28,0.32,0.54],["Felipe López",3.75,1.71,0.83,0.45,0.13],["Fred Hoiberg",6.26,2.91,1.25,0.75,0.15],["Gary Trent",6.32,3.65,0.87,0.31,0.33],["Gerald Green",5.1,2.1,1,0.3,0.1],["Greg Buckner",4,2.1,1.3,0.7,0.1],["Igor Rakočević",1.9,0.4,0.8,0.1,0],["Jason Collins",1.8,2.3,0.4,0.3,0.4],["Joe Smith",9.55,5.92,0.99,0.49,0.97],["John Thomas",2.5,2.2,0.4,0.3,0.3],["Justin Reed",4.43,1.74,0.65,0.3,0.2],["Keith McLeod",2.7,1,1.8,0.5,0],["Kendall Gill",8.7,3,1.9,1,0.2],["Kevin Garnett",22.47,12.7,5.03,1.39,1.66],["Kevin Love",11.1,9.1,1,0.4,0.6],["Kevin Ollie",4,1.5,2.3,0.4,0.1],["Kirk Snyder",8.4,4.2,2.1,0.7,0.5],["LaPhonso Ellis",9.4,6,1.1,0.8,0.9],["Latrell Sprewell",14.82,3.5,2.86,0.9,0.3],["Loren Woods",1.92,2.19,0.44,0.3,0.48],["Malik Sealy",11.3,4.3,2.4,0.9,0.2],["Marc Jackson",5.3,3.12,0.46,0.3,0.33],["Marcus Banks",12,2.9,4.7,1.2,0.3],["Mark Blount",11.59,5.73,0.8,0.53,0.8],["Mark Madsen",1.84,2.55,0.28,0.32,0.25],["Marko Jarić",7.18,2.91,3.4,1.27,0.3],["Michael Doleac",2.4,2,0.3,0.4,0.4],["Michael Olowokandi",6.11,5.45,0.53,0.36,1.1],["Mike James",10.1,2,3.6,0.7,0.1],["Mike Miller",9.9,6.6,4.5,0.4,0.4],["Mike Wilks",2,1,1.6,0.4,0.1],["Oliver Miller",2.5,2.7,0.8,0.4,0.5],["Randy Foye",12.98,2.97,3.64,0.81,0.3],["Rashad McCants",9.94,2.03,1.31,0.75,0.24],["Rasho Nesterović",7.47,5.4,1.03,0.4,1.18],["Reggie Slater",4.12,2.69,0.4,0.27,0.14],["Richie Frahm",2.6,0.9,0.6,0.1,0.1],["Ricky Davis",17.65,4.12,4.8,1.06,0.27],["Rod Strickland",6.8,2,4.6,1,0.1],["Rodney Carney",7.2,1.9,0.4,0.7,0.4],["Ronald Dupree",2.2,1.4,0.4,0.3,0],["Ryan Gomes",12.95,5.3,1.7,0.8,0.2],["Sam Cassell",17.14,3.05,6.37,1,0.2],["Sam Mitchell",4.33,1.55,0.96,0.3,0.13],["Sebastian Telfair",9.58,1.97,5.18,1,0.2],["Terrell Brandon",15.8,3.48,8.19,1.93,0.32],["Todd Day",4.3,1.2,0.9,0.3,0.2],["Tom Hammonds",1.98,1.67,0.19,0.09,0.09],["Trenton Hassell",6.85,2.97,2.11,0.42,0.45],["Troy Hudson",10,1.6,3.81,0.46,0.09],["Wally Szczerbiak",15.5,4.41,2.73,0.67,0.3],["William Avery",2.66,0.66,1.42,0.22,0.04]]],
    ["MIN","2010s",[["A.J. Price",1.6,0.4,0.5,0,0],["Aaron Brooks",2.3,0.5,0.6,0.2,0],["Adreian Payne",4.06,3.01,0.68,0.41,0.27],["Al Jefferson",17.1,9.3,1.8,0.8,1.3],["Alexey Shved",6.53,1.85,2.53,0.56,0.36],["Andre Miller",3.4,0.9,2.2,0.3,0],["Andrei Kirilenko",12.4,5.7,2.8,1.5,1],["Andrew Wiggins",19.43,4.27,2.17,1.02,0.58],["Anthony Bennett",5.2,3.8,0.8,0.5,0.3],["Anthony Randolph",9.14,4.25,0.8,0.56,0.88],["Anthony Tolliver",5.36,3.43,0.83,0.36,0.36],["Brandon Rush",4.2,2.1,1,0.5,0.5],["Brian Cardinal",1.7,1,0.8,0.3,0.1],["Chase Budinger",7.23,2.86,0.95,0.62,0.1],["Chris Johnson",3.9,2,0.3,0.2,0.9],["Cole Aldrich",1.42,2.04,0.32,0.32,0.3],["Corey Brewer",11.51,3.02,2.03,1.7,0.36],["Damien Wilkins",5.6,3.1,1.7,0.8,0.3],["Damjan Rudež",2.3,0.6,0.3,0.1,0],["Dante Cunningham",7.49,4.6,0.9,0.95,0.6],["Dario Šarić",10.5,5.5,1.5,0.6,0.1],["Darko Miličić",7.7,4.81,1.35,0.68,1.62],["Derrick Rose",16.17,2.4,3.84,0.57,0.17],["Derrick Williams",10.13,4.94,0.56,0.54,0.49],["Glenn Robinson III",1.2,0.6,0.1,0.1,0],["Gorgui Dieng",7.96,6.22,1.38,0.83,0.99],["Greg Stiemsma",4,3.4,0.4,0.6,1.2],["J.J. Barea",10.12,2.43,4.28,0.38,0],["Jamal Crawford",10.3,1.2,2.3,0.5,0.1],["Jeff Teague",13.41,2.81,7.45,1.31,0.34],["Jerryd Bayless",6.1,1.8,3.5,0.5,0.1],["Jimmy Butler",22.07,5.29,4.81,2.06,0.49],["Jonny Flynn",10.26,2.04,4,0.84,0.04],["Josh Okogie",7.7,2.9,1.2,1.2,0.4],["Karl-Anthony Towns",22.24,11.87,2.61,0.77,1.5],["Keita Bates-Diop",5,2.8,0.6,0.6,0.5],["Kevin Garnett",3.71,4.05,1.6,0.73,0.36],["Kevin Love",21.5,13.13,2.86,0.74,0.45],["Kevin Martin",17.07,2.92,1.77,0.79,0.05],["Kosta Koufos",2.7,2.5,0.2,0.2,0.5],["Kris Dunn",3.8,2.1,2.4,1,0.5],["Lazar Hayward",3.69,1.64,0.71,0.32,0.18],["Lorenzo Brown",4.2,2.4,3.1,1,0.2],["Lou Amundson",1.6,2.4,0.2,0.4,0.3],["Luc Mbah a Moute",3.3,2.2,0.4,0.4,0.2],["Luke Ridnour",11.76,2.65,4.61,1.13,0.19],["Luol Deng",7.1,3.3,0.8,0.7,0.4],["Malcolm Lee",4.03,1.86,1.46,0.58,0.29],["Marcus Georges-Hunt",1.4,0.4,0.2,0.1,0],["Martell Webster",8.33,3.4,1.05,0.65,0.3],["Michael Beasley",16.18,5.13,1.73,0.58,0.58],["Mickaël Gelabale",5,2.8,0.7,0.4,0.1],["Mo Williams",12.2,2.4,6.4,0.7,0.2],["Nathan Jawai",3.2,2.7,0.6,0.3,0.2],["Nemanja Bjelica",6.07,3.81,1.3,0.57,0.3],["Nikola Peković",12.58,6.69,0.75,0.53,0.55],["Oleksiy Pecherov",4.5,2.8,0.3,0.2,0.3],["Ramon Sessions",8.2,2.6,3.1,0.7,0.1],["Ricky Rubio",10.34,4.26,8.48,2.1,0.11],["Robbie Hummel",3.86,2.73,0.49,0.35,0.09],["Robert Covington",14.5,5.7,1.5,2.3,1.1],["Ronny Turiaf",4.51,5.29,0.81,0.28,1.5],["Ryan Gomes",10.9,4.6,1.6,0.8,0.2],["Ryan Hollins",6.1,2.8,0.7,0.3,0.5],["Sasha Pavlović",3.7,1.6,0.8,0.3,0.1],["Sebastian Telfair",7.2,1.5,3,0.7,0.1],["Shabazz Muhammad",9.03,2.78,0.52,0.3,0.1],["Taj Gibson",11.56,6.82,1.2,0.8,0.65],["Tayshaun Prince",2.9,1.9,0.9,0.5,0.2],["Thaddeus Young",14.3,5.1,2.8,1.8,0.4],["Tyus Jones",5.07,1.54,3.32,1.04,0.1],["Wayne Ellington",6.47,1.91,0.96,0.42,0.09],["Wesley Johnson",7.65,2.86,1.45,0.61,0.7],["Zach LaVine",13.66,2.94,3.26,0.79,0.16]]],
    ["MIN","2020s",[["Mike Conley",9,2.5,5,1,0.2],["Ricky Rubio",8.6,3.3,6.4,1.4,0.1],["Patrick Beverley",9.2,4.1,4.6,1.2,0.9],["Greg Monroe",5.4,4.6,1.6,0.6,0.7],["Ed Davis",2.1,5,0.9,0.6,0.6],["Austin Rivers",4.9,1.6,1.4,0.5,0.1],["Rudy Gobert",12.6,11.7,1.5,0.8,1.6],["T.J. Warren",3.7,2,0.8,0.4,0.1],["Kyle Anderson",7.3,4.1,4,1,0.7],["Julius Randle",19.9,6.9,4.8,0.9,0.2],["Joe Ingles",1.1,0.6,1.2,0.2,0.1],["D'Angelo Russell",18.6,3,6.4,1.1,0.3],["Karl-Anthony Towns",23,9.2,4,0.8,0.9],["Malik Beasley",15.9,3.7,1.9,0.7,0.2],["Taurean Prince",8.2,2.5,1.3,0.6,0.3],["Jake Layman",3.8,1.3,0.4,0.4,0.2],["Juancho Hernangomez",7.2,3.9,0.7,0.4,0.1],["Bryn Forbes",3.6,0.6,0.7,0.3,0.1],["Justin Jackson",0,0,0,0,0],["PJ Dozier",0.8,0.6,0.6,0.1,0],["Monte Morris",5,1.7,2.1,0.6,0.3],["Donte DiVincenzo",11.9,3.9,3.7,1.2,0.3],["Josh Okogie",4.1,2,0.8,0.7,0.3],["Jarred Vanderbilt",6.2,7.1,1.2,1.1,0.6],["Jordan McLaughlin",4,1.6,3,0.8,0.1],["Jarrett Culver",5.3,3.1,0.7,0.5,0.3],["Nickeil Alexander-Walker",7.9,2.3,2.3,0.6,0.4],["Jaylen Nowell",9.4,2.3,1.9,0.5,0.2],["Naz Reid",12,5.1,1.5,0.7,0.9],["Anthony Edwards",24.6,5.2,4.1,1.3,0.6],["Jaden McDaniels",10.9,4.1,1.7,0.9,0.9],["Leandro Bolmaro",1.4,1.2,0.6,0.2,0],["Ashton Hagans",0,0,0,0,0],["Daishen Nix",1.1,0.8,0.7,0.1,0],["Nathan Knight",3.7,1.9,0.4,0.2,0.2],["Ayo Dosunmu",14.8,3.4,3.6,0.8,0.3],["Matt Ryan",3.6,0.8,0.5,0.1,0],["Bones Hyland",7.3,1.4,2,0.7,0.2],["Terrence Shannon Jr.",4.9,1.3,0.9,0.2,0.1],["Johnny Juzang",2,0.8,0.3,0.1,0],["Luka Garza",4.7,1.6,0.4,0.2,0.1],["McKinley Wright IV",1,0,0.6,0,0],["Wendell Moore Jr.",1,0.6,0.4,0.2,0.1],["Leonard Miller",1.6,1,0.2,0.2,0.1],["Josh Minott",2.4,1.1,0.3,0.3,0.3],["Jaylen Clark",4,1.6,0.6,0.8,0.1],["Julian Phillips",2.9,1,0.2,0.5,0.1],["Tristen Newton",0.4,0.5,0.3,0.1,0],["Rob Dillingham",4.5,1,2,0.4,0],["Zyon Pullin",4.6,0.6,1.8,0.2,0],["Jesse Edwards",0,0,0.5,0,0],["Enrique Freeman",3.3,2.5,0.5,0.5,0.8],["Joan Beringer",3.9,2.3,0.3,0.2,0.7],["Rocco Zikarsky",2.8,2.8,0.4,0,1]]],
    ["NOP","2000s",[["Aaron Williams",5.8,4.9,0.5,0.4,0.5],["Antonio Daniels",3.8,0.9,2.1,0.3,0],["Baron Davis",20.22,4,7.05,2.08,0.37],["Bobby Jackson",9.02,2.84,2.14,0.81,0.1],["Bonzi Wells",8.8,3.2,0.8,1.1,0.4],["Boštjan Nachbar",7.13,2.55,1.11,0.5,0.27],["Brandon Bass",2.17,2.17,0.1,0.1,0.16],["Bryce Drew",1.12,0.68,0.85,0.25,0],["Casey Jacobsen",7.6,2.3,1.7,0.5,0.2],["Cedric Simmons",2.9,2.5,0.3,0.2,0.5],["Chris Andersen",6.56,5.49,0.77,0.22,1.4],["Chris Paul",19.43,4.76,9.88,2.4,0.08],["Courtney Alexander",7.9,1.8,1.2,0.5,0.1],["Dan Dickau",13.2,2.7,5.2,1.1,0.1],["Darrell Armstrong",10.52,2.98,4.01,1.61,0.18],["David Wesley",15.22,2.47,3.34,1.35,0.12],["David West",15.39,7.19,1.67,0.65,0.83],["Desmond Mason",12.3,4.46,1.21,0.65,0.25],["Devin Brown",8.27,3.05,1.71,0.64,0.15],["Elden Campbell",7.2,3.5,1,0.6,0.8],["George Lynch",4.44,4.16,1.53,0.7,0.22],["Hilton Armstrong",3.59,2.67,0.34,0.27,0.54],["J.R. Smith",9.21,2,1.56,0.7,0.1],["Jackson Vroman",3.48,3.22,0.58,0.44,0.39],["Jamaal Magloire",11.92,9.47,1.08,0.52,1.26],["Jamal Mashburn",21.45,6.12,5.02,0.94,0.22],["James Posey",8.9,4.8,1.1,0.8,0.3],["Jannero Pargo",8.66,1.9,2.45,0.6,0.05],["Julian Wright",4.14,2.44,0.75,0.55,0.3],["Junior Harrington",5.6,2.2,2.1,0.9,0.2],["Jérôme Moïso",4,3.5,0.4,0.4,0.9],["Kenny Anderson",6,2,3.3,0.8,0.2],["Kirk Snyder",8,2.4,1.5,0.4,0.3],["Lee Nailon",14.2,4.4,1.6,0.5,0.2],["Linton Johnson",4.57,3.43,0.33,0.53,0.33],["Maciej Lampe",3.1,2.64,0.54,0.18,0.18],["Marc Jackson",7.89,3.82,0.93,0.37,0.1],["Matt Freije",4,2.7,0.9,0.6,0.1],["Melvin Ely",3.6,2.54,0.47,0.1,0.3],["Mike James",2.64,0.83,0.49,0.23,0],["Morris Peterson",6.7,2.45,0.72,0.49,0.06],["P.J. Brown",10.27,8.49,1.81,0.85,0.8],["Peja Stojaković",15.27,4.29,1.17,0.77,0.08],["Rasual Butler",9.13,2.94,0.73,0.47,0.62],["Robert Pack",5.2,1.8,2.9,0.9,0],["Robert Traylor",4.51,3.75,0.65,0.6,0.5],["Rodney Rogers",9.2,4.7,2,0.6,0.4],["Ryan Bowen",2.2,1.67,0.47,0.63,0.2],["Sean Marks",3.2,3.1,0.2,0.1,0.6],["Sean Rooks",2.3,1.4,0.3,0.3,0.1],["Speedy Claxton",11.29,2.55,4.93,1.48,0.1],["Stacey Augmon",4.39,2.1,1.1,0.6,0.15],["Steve Smith",5,1.1,0.8,0.2,0.1],["Tyson Chandler",10.26,11.27,0.85,0.49,1.38]]],
    ["NOP","2010s",[["Aaron Gray",3.28,4.05,0.55,0.34,0.37],["Al-Farouq Aminu",6.88,6.27,1.28,1.04,0.57],["Alexis Ajinça",6,4.66,0.58,0.36,0.71],["Alonzo Gee",4.5,3.4,1,0.9,0.2],["Anthony Davis",23.73,10.53,2.11,1.38,2.4],["Anthony Morrow",8.4,1.8,0.8,0.5,0.2],["Austin Rivers",6.95,1.86,2.27,0.55,0.12],["Bobby Brown",6.6,0.8,2.1,0.4,0],["Brian Roberts",8.2,1.54,3.04,0.55,0.05],["Buddy Hield",8.6,2.9,1.4,0.3,0.1],["Carl Landry",12.25,4.8,0.79,0.34,0.37],["Cheick Diallo",5.45,4.65,0.42,0.34,0.45],["Chris Kaman",13.1,7.7,2.1,0.5,1.6],["Chris Paul",16.91,4.14,10.12,2.29,0.14],["D.J. Mbenga",1.4,2.1,0.1,0.1,0.7],["Dante Cunningham",5.79,3.68,0.75,0.58,0.43],["Darius Miller",6.03,1.69,1.38,0.42,0.22],["Darius Songaila",7.2,3.1,0.9,0.8,0.2],["Darren Collison",12.4,2.5,5.7,1,0.1],["David Andersen",2.7,1.7,0.2,0.1,0.2],["David West",18.95,7.55,2.68,0.95,0.79],["DeAndre Liggins",1.6,1,0.8,0.4,0.1],["DeMarcus Cousins",24.99,12.77,5.01,1.57,1.47],["Devin Brown",9.7,2.8,1.5,0.8,0.1],["Donatas Motiejūnas",4.4,3,0.9,0.5,0.3],["E'Twaun Moore",11.33,2.49,2.16,0.84,0.23],["Elfrid Payton",10.6,5.2,7.6,1,0.4],["Emeka Okafor",9.55,8.48,0.64,0.6,1.48],["Eric Gordon",15.32,2.37,3.32,1.04,0.23],["Frank Jackson",8.1,2.2,1.1,0.4,0],["Greg Stiemsma",2.9,4.1,0.7,0.6,1],["Greivis Vásquez",11.61,3.52,7.35,0.85,0.1],["Gustavo Ayón",5.9,4.9,1.4,1,0.9],["Ian Clark",7.09,1.61,1.54,0.4,0.1],["Ish Smith",8.9,3.4,5.7,0.9,0.2],["Jahlil Okafor",8.2,4.7,0.7,0.3,0.7],["Jameer Nelson",5.1,2.2,3.6,0.5,0.1],["James Posey",5.2,4.3,1.5,0.5,0.2],["Jarrett Jack",11.14,2.64,4.02,0.65,0.14],["Jason Smith",7.23,3.99,0.69,0.35,0.72],["Jeff Withey",3.03,2.25,0.36,0.22,0.74],["Jimmer Fredette",3.37,0.74,1.13,0.3,0],["John Salmons",2,1,0.6,0.4,0.2],["Jordan Crawford",12.54,1.59,2.92,0.52,0.12],["Jrue Holiday",17.41,4.05,6.85,1.52,0.63],["Julian Wright",3.8,2.1,0.6,0.4,0.3],["Julius Randle",21.4,8.7,3.1,0.7,0.6],["Kendrick Perkins",2.5,3.5,0.8,0.3,0.3],["Kenrich Williams",6.1,4.8,1.8,1,0.4],["Lance Thomas",3.03,2.31,0.31,0.19,0.13],["Langston Galloway",8.6,2.2,1.2,0.7,0.1],["Lou Amundson",2.25,3.15,0.35,0.5,0.45],["Luke Babbitt",5.53,2.54,0.78,0.27,0.21],["Marco Belinelli",11.09,2.22,1.34,0.59,0.1],["Marcus Thornton",11.91,2.86,1.33,0.65,0.16],["Morris Peterson",7.1,2.7,0.9,0.5,0.1],["Nikola Mirotić",15.68,8.25,1.25,0.85,0.85],["Norris Cole",10.33,2.79,3.51,0.68,0.18],["Peja Stojaković",12.15,3.46,1.46,0.76,0.09],["Quincy Pondexter",5.31,2.03,0.85,0.3,0.28],["Rajon Rondo",8.3,4,8.2,1.1,0.2],["Robin Lopez",11.3,5.6,0.8,0.4,1.6],["Roger Mason",5.3,1.9,1.1,0.4,0.2],["Ryan Anderson",16.11,5.87,1.05,0.53,0.36],["Solomon Hill",5.72,3.47,1.64,0.74,0.31],["Terrence Jones",11.5,5.9,1.2,0.8,1],["Tim Frazier",7.08,2.99,5.19,0.82,0.1],["Toney Douglas",7.98,2.22,2.5,1.07,0.13],["Tony Allen",4.7,2.1,0.4,0.5,0.1],["Trevor Ariza",10.93,5.33,2.59,1.64,0.47],["Tyreke Evans",14.76,4.82,5.63,1.21,0.37],["Wesley Johnson",3.7,2.1,0.6,0.5,0.3],["Willie Green",8.7,2.1,1,0.5,0.2],["Xavier Henry",4.56,2.08,0.54,0.44,0.15],["Ömer Aşık",4.91,7.2,0.6,0.31,0.45]]],
    ["NOP","2020s",[["DeAndre Jordan",4.4,6.3,0.9,0.3,0.8],["James Johnson",7.2,3.5,1.9,0.8,0.8],["Garrett Temple",3.6,1.5,0.9,0.6,0.2],["Eric Bledsoe",12.2,3.4,3.8,0.8,0.3],["Jonas Valančiūnas",14.7,10.1,2.2,0.4,0.8],["Isaiah Thomas",7.7,1.3,1.7,0.3,0],["James Nunnally",1.7,1,0.3,0,0],["CJ McCollum",21,4.2,4.9,0.9,0.5],["Cody Zeller",1.8,2.6,0.9,0.2,0.1],["Kelly Olynyk",8.7,4.7,2.9,0.8,0.4],["Steven Adams",7.6,8.9,1.9,0.9,0.7],["Tony Snell",3.5,1.9,0.5,0.3,0.2],["Elfrid Payton",3.5,3.3,6.9,1,0.5],["Kevon Looney",2.8,5.6,1.6,0.4,0.5],["Willy Hernangomez",7.9,6.2,1.1,0.4,0.4],["Josh Richardson",10.1,2.7,2.7,1.1,0.3],["Larry Nance Jr.",6.5,5.3,1.8,0.9,0.4],["Brandon Ingram",23,5.3,5.5,0.7,0.5],["Dejounte Murray",17.1,6,6.9,1.8,0.3],["Tyrone Wallace",2.8,1.3,0.2,0.5,0.2],["Lonzo Ball",14.6,4.8,5.7,1.5,0.6],["Josh Hart",9.2,8,2.3,0.8,0.3],["Wes Iwundu",2.4,2.2,0.4,0.4,0.1],["Daniel Theis",4.3,4.3,1.6,0.5,0.5],["Mo Bamba",4.3,4.5,0.6,0.3,1],["Bruce Brown",8.3,4,2,0.8,0.2],["Devonte' Graham",11.9,2.3,4.2,0.9,0.2],["Alize Johnson",1.8,2.7,0.4,0.2,0],["Gary Clark",2.7,2.4,0.5,0.3,0.2],["Wenyen Gabriel",3.4,2.6,0.5,0.4,0.4],["Kaiser Gates",0,1,0,0,0],["Jared Harper",7.4,0.4,2.8,0.8,0.2],["Zion Williamson",24.3,6.6,4.4,1.1,0.7],["Jaxson Hayes",7.3,3.9,0.6,0.4,0.6],["Nickeil Alexander-Walker",11,3.1,2.2,1,0.5],["Jordan Poole",13.4,2,3.1,0.6,0.4],["Didi Louzada",2.7,1,1,0.7,0],["Saddiq Bey",17.7,5.6,2.5,0.9,0.1],["Kira Lewis Jr.",5.6,1.4,1.7,0.5,0.1],["Naji Marshall",7.4,3.6,2.1,0.7,0.2],["Will Magnay",0,0,0,0,0],["Matt Ryan",3.5,0.9,0.4,0.2,0],["Jeremiah Robinson-Earl",4.6,3.3,0.9,0.4,0.1],["Brandon Boston",10.7,3.2,2.2,1.3,0.2],["Herbert Jones",9.9,3.8,2.7,1.6,0.6],["Trey Murphy III",15.5,4.3,2.3,1,0.4],["E.J. Liddell",0.5,0.6,0.1,0.3,0.3],["Hunter Dickinson",2.4,1,0.4,0.2,0.4],["Jalen Crutcher",0,0,0,0,0],["Jose Alvarado",8.1,2.2,3.1,1.2,0.2],["Dyson Daniels",4.8,3.5,2.5,1,0.3],["Bryce McGowens",8.1,2.1,1.5,0.6,0.2],["Izaiah Brockington",4,2,0,0,0],["Dereon Seabron",1.5,0.7,0.4,0.1,0.1],["Keion Brooks Jr.",10.1,4.1,0.9,0.7,0.7],["Karlo Matković",6.7,4.3,1,0.5,0.9],["Jamal Cain",5.3,2.3,0.6,0.6,0.2],["Lester Quinones",6.6,1.5,1.8,0.2,0.2],["Jordan Hawkins",7.9,2.2,1,0.4,0.2],["Trey Alexander",5.2,1.2,1,0.7,0.2],["Antonio Reeves",6.9,1.4,0.9,0.5,0.1],["Yves Missi",7.4,7,1.4,0.4,1.4],["Josh Oduro",8.3,7.7,1.3,0,0],["Jeremiah Fears",14.3,3.7,3.4,1.2,0.4],["Derik Queen",11.7,7.1,3.7,1,0.9],["Micah Peavy",4.3,1.9,1,0.7,0.1]]],
    ["NYK","1960s",[["Al Butler",10.76,3.24,2.52,null,null],["Art Heyman",11.3,3.07,2.55,null,null],["Barry Clemens",5.4,2.6,1,null,null],["Bevo Nordmann",9.47,7.78,1.2,null,null],["Bill Bradley",10.84,3.66,3.45,null,null],["Bill Hosket",2.6,1.9,0.4,null,null],["Bob Anderegg",4,2.1,0.9,null,null],["Bob Boozer",15.45,7.94,1.36,null,null],["Bob McNeill",5.8,1.6,3.2,null,null],["Carl Braun",11.33,2.88,4.61,null,null],["Cazzie Russell",15.17,4.03,2.38,null,null],["Charlie Tyra",11.03,7.48,1.23,null,null],["Cleveland Buckner",6.01,3.53,0.62,null,null],["Darrall Imhoff",5.36,5.57,0.97,null,null],["Dave Budd",7.11,4.62,0.95,null,null],["Dave DeBusschere",16.4,11.4,2.7,null,null],["Dave Stallworth",12.79,6.2,2.11,null,null],["Dick Barnett",18.93,3.36,3.13,null,null],["Dick Garmaker",14.88,4.14,3.02,null,null],["Dick Van Arsdale",12.81,5.73,2.77,null,null],["Don May",4.3,2.4,0.7,null,null],["Donnie Butcher",5.17,2.3,1.79,null,null],["Em Bryant",5.93,2.58,2.55,null,null],["Freddie Crawford",5.59,2.62,1.16,null,null],["Gene Conley",7.1,5.39,0.8,null,null],["Gene Shue",11.7,2.4,3.3,null,null],["George Blaney",3.3,1,1.3,null,null],["Henry Akin",3.8,2.4,0.5,null,null],["Howard Komives",11.93,2.75,4.41,null,null],["Jack George",8.67,2.73,3.29,null,null],["Jim Barnes",15.52,9.75,1.21,null,null],["Jim Palmer",6.64,4.19,0.75,null,null],["John Rudometkin",6.35,2.98,0.5,null,null],["Johnny Egan",10.49,2.22,4.14,null,null],["Johnny Green",12.96,10.22,1.69,null,null],["Kenny Sears",14.78,8.88,1.95,null,null],["Len Chappell",11.68,6.2,0.76,null,null],["Mike Farmer",7.19,5.56,0.87,null,null],["Mike Riordan",2.3,1.1,0.9,null,null],["Nate Bowman",2.82,3.07,0.68,null,null],["Neil Johnson",3.03,2.57,0.75,null,null],["Paul Hogue",7.22,7.95,0.8,null,null],["Phil Jackson",6.55,4.77,0.78,null,null],["Phil Jordon",12.25,6.82,2.19,null,null],["Phil Rollins",5.8,2.1,2.5,null,null],["Richie Guerin",23.59,6.29,5.97,null,null],["Sam Stith",4.4,1.6,1.9,null,null],["Tom Gola",7.81,5.2,3.24,null,null],["Tom Hoover",3.82,4.67,0.57,null,null],["Walt Bellamy",18.93,13.29,2.47,null,null],["Walt Frazier",13.42,5.24,6.07,null,null],["Whitey Bell",5.07,2.61,1.58,null,null],["Whitey Martin",3.4,2.4,1.7,null,null],["Willie Naulls",22.74,12.61,2.33,null,null],["Willis Reed",19.61,13.74,1.77,null,null]]],
    ["NYK","1970s",[["Bill Bradley",12.74,3.08,3.4,0.66,0.2],["Bill Hosket",3.3,1.8,0.5,null,null],["Bob McAdoo",26.65,12,3.33,1.34,1.42],["Butch Beard",7.59,3.25,3.15,1.17,0.06],["Cazzie Russell",10.53,3.17,1.57,null,null],["Charlie Paulk",1.4,1.8,0.3,null,null],["Dave DeBusschere",15.95,10.67,3.15,0.9,0.5],["Dave Stallworth",8.18,3.93,1.48,0.4,0.4],["Dean Meminger",5.61,2.71,1.6,0.65,0.07],["Dennis Bell",2.78,1.87,0.46,0.43,0.18],["Dick Barnett",12.28,2.19,2.58,0.2,0],["Dick Garrett",3,1,0.6,0.3,0],["Don May",2.6,1.4,0.5,null,null],["Earl Monroe",16.99,2.82,3.71,1.12,0.31],["Eddie Mast",2.34,1.84,0.21,null,null],["Eddie Miles",1.5,0.4,0.4,null,null],["Gene Short",2.6,1.5,0.3,0.3,0.1],["Glen Gondrezick",4.9,4.62,1.3,1.06,0.25],["Greg Fillmore",2.38,2.22,0.38,null,null],["Harthorne Wingo",4.81,3.54,0.59,0.36,0.25],["Henry Bibby",6.87,1.81,1.56,0.83,0.04],["Jerry Lucas",11.05,8.56,3.93,0.4,0.3],["Jesse Dark",3.6,0.8,0.6,0.1,0],["Jim Barnett",6.07,1.37,1.33,0.33,0],["Jim Cleamons",8,2.75,4.2,0.9,0.15],["Jim McMillian",9.13,4.05,2.32,0.9,0.15],["Joe Meriweather",9.5,5.5,1.2,0.6,1.3],["John Gianelli",8.21,6.3,1.33,0.39,1.02],["John Rudd",3.2,2.9,0.6,0.3,0.1],["John Warren",2.5,0.9,0.7,null,null],["Lonnie Shelton",13.25,7.4,2.1,1.4,1.3],["Luther Rackley",3.74,2.97,0.3,null,null],["Marvin Webster",11.3,10.9,2.9,0.4,1.9],["Mel Davis",4.53,3.99,0.76,0.3,0.09],["Mike Glenn",7.8,1.1,1.8,0.5,0.1],["Mike Price",1.66,0.55,0.28,null,null],["Mike Riordan",6.14,2.2,1.96,null,null],["Mo Layton",5.8,0.8,2.8,0.4,0.1],["Nate Bowman",2.9,3.2,0.6,null,null],["Neal Walk",6.39,3.99,1.22,0.28,0.25],["Phil Jackson",6.89,4.37,1.13,0.6,0.45],["Ray Williams",13.3,3.1,5.35,1.45,0.2],["Spencer Haywood",17.08,8.62,1.55,0.57,1],["Ticky Burden",5.55,1.07,0.98,0.79,0],["Toby Knight",11.51,5.37,1.01,0.65,0.55],["Tom Barker",4.6,3.8,0.4,0.3,0.3],["Tom McMillen",9.4,5.7,0.9,0.2,0.1],["Tom Riker",2.75,1.68,0.31,0.22,0.08],["Walt Frazier",20.73,6.27,6.37,1.99,0.17],["Willis Reed",17.39,11.68,1.92,0.6,1.1]]],
    ["NYK","1980s",[["Alex Bradley",3.5,1.7,0.3,0.3,0.1],["Bernard King",26.5,5.19,2.82,1.16,0.22],["Bill Cartwright",16.76,7.15,1.49,0.59,0.99],["Billy Donovan",2.4,0.6,2,0.4,0],["Bob Thornton",3.81,3.25,0.48,0.3,0.09],["Butch Carter",7.43,1.35,2.28,0.76,0.09],["Campy Russell",15.17,3.81,3.5,1.15,0.15],["Charles Oakley",12.9,10.5,2.3,1.3,0.2],["Chris McNealy",4.33,4.56,1.04,0.83,0.29],["Darrell Walker",10.57,2.7,4.23,1.77,0.3],["DeWayne Scales",4.65,2.92,0.19,0.3,0.11],["Earl Monroe",7.4,0.7,1.3,0.4,0.1],["Ed Sherod",6.2,2.3,4.9,1.5,0.2],["Eddie Lee Wilkins",4.88,3.5,0.2,0.26,0.22],["Eric Fernsten",2.6,2.7,0.3,0.5,0.3],["Ernie Grunfeld",5.63,2.15,1.58,0.57,0.13],["Fred Cofield",3.7,1,1.8,0.4,0.1],["Geoff Huston",3.1,0.8,2.2,0.5,0.1],["Gerald Henderson",10.2,2.34,6.15,1.31,0.18],["Gerald Wilkins",15.81,3.15,3.45,1.1,0.23],["Greg Butler",1.7,0.8,0.1,0,0.1],["Hollis Copeland",5,1.75,0.98,0.68,0.26],["James Bailey",7.52,5.54,0.7,0.52,0.74],["Jawann Oldham",3.9,4.1,0.4,0.5,1.6],["Jim Cleamons",3.4,0.9,1.8,0.6,0.1],["Joe Meriweather",9,5.4,1,0.6,1.8],["Johnny Newman",13.08,2.31,1.42,1.16,0.2],["Ken Bannister",7.67,4.5,0.55,0.55,0.4],["Kenny Walker",8.53,4.17,0.86,0.67,0.67],["Kiki Vandeweghe",9.2,1.3,1.3,0.4,0.3],["Larry Demic",4.74,3.9,0.54,0.38,0.26],["Len Elmore",2.4,2.5,0.5,0.4,0.5],["Louis Orr",9.24,3.5,1.43,0.84,0.28],["Mark Jackson",15.14,4.75,9.66,2.22,0.1],["Marvin Webster",5.13,5.4,0.83,0.34,1.26],["Maurice Lucas",15.8,11.3,2.2,0.9,0.9],["Mike Glenn",7.1,1,1.2,0.71,0.1],["Mike Newlin",9.3,1.2,2.2,0.4,0],["Mike Woodson",4.7,1.2,0.9,0.4,0.1],["Pat Cummings",10.95,6.56,1.12,0.59,0.24],["Patrick Ewing",21.19,8.8,1.9,1.34,2.82],["Paul Westphal",10.31,1.36,5.52,1.1,0.24],["Pete Myers",2.8,0.8,1.6,0.6,0.1],["Randy Smith",10,1.9,3.1,1.1,0],["Ray Williams",18.54,4.22,5.87,2.13,0.37],["Reggie Carter",3.47,1.26,1.52,0.46,0.06],["Rick Carlisle",2.8,0.5,1.2,0.4,0.2],["Rod Strickland",8.9,2,3.9,1.2,0],["Ron Cavenall",1.5,3.1,0.4,0.2,0.8],["Rory Sparrow",9.63,2.1,6.25,1.06,0.12],["Scott Hastings",1.1,1.5,0,0.2,0],["Sedric Toney",2.7,0.4,1.1,0.4,0],["Sidney Green",7.05,6.3,1,0.7,0.3],["Sly Williams",11.09,4.19,1.96,1.13,0.17],["Toby Knight",14.6,4.78,1.47,1.07,0.84],["Trent Tucker",8.89,2.2,2.2,0.99,0.13],["Truck Robinson",9.97,8.18,1.62,0.7,0.36],["Vince Taylor",3.1,1.2,1.3,0.6,0.1]]],
    ["NYK","1990s",[["Allan Houston",16.54,3.12,2.47,0.66,0.24],["Anthony Bonner",4.52,4.61,1.29,0.91,0.29],["Anthony Bowie",2.8,1,0.4,0.2,0.1],["Anthony Mason",9.86,7.71,2.61,0.64,0.24],["Brad Lohaus",3.9,1.3,1.2,0.3,0.4],["Brian Quinnett",3.53,1.58,0.6,0.25,0.19],["Buck Williams",5.8,5.08,0.63,0.46,0.46],["Charles Oakley",10.03,9.97,2.34,1.14,0.23],["Charles Smith",11.29,4.48,1.44,0.57,1.2],["Charlie Ward",5.97,2.71,4.22,1.4,0.26],["Chris Childs",7.51,2.69,4.72,0.97,0.11],["Chris Dudley",2.82,4.83,0.31,0.3,0.91],["Chris Mills",9.7,5.1,1.7,0.6,0.4],["David Wingate",0.7,0.4,0.3,0.2,0],["Derek Harper",11.72,2.24,4.84,1.35,0.1],["Doc Rivers",7.7,2.44,5.22,1.53,0.14],["Doug Christie",3.07,1.36,0.96,0.4,0.1],["Eddie Lee Wilkins",4.42,3.03,0.2,0.25,0.15],["Gary Grant",4.9,1.1,1.5,0.8,0.1],["Gerald Wilkins",13.55,3.35,3.54,1.09,0.26],["Greg Anthony",6.54,1.91,4.22,1.13,0.15],["Greg Grant",1.2,0.5,0.9,0.4,0],["Herb Williams",2.87,2.21,0.38,0.28,0.57],["Hubert Davis",9.53,1.35,1.9,0.46,0.1],["J.R. Reid",6.6,4,0.8,0.5,0.2],["Jerrod Mustaf",4.3,2.7,0.6,0.2,0.2],["John Starks",14.1,2.65,3.98,1.21,0.15],["John Wallace",4.8,2.3,0.5,0.3,0.4],["Johnny Newman",12.9,2.4,2.3,1.2,0.3],["Kenny Walker",6.31,4.07,0.48,0.41,0.71],["Kiki Vandeweghe",11.88,1.95,1.31,0.45,0.1],["Kurt Thomas",8.1,5.7,1.1,0.9,0.3],["Larry Johnson",13.57,5.53,2.25,0.7,0.32],["Latrell Sprewell",16.4,4.2,2.5,1.2,0.1],["Marcus Camby",7.2,5.5,0.3,0.6,1.6],["Mark Jackson",10.05,3.5,7.48,1.18,0.1],["Maurice Cheeks",7.83,2.33,5.47,1.61,0.13],["Monty Williams",2.82,2.09,0.97,0.4,0.07],["Patrick Ewing",24.08,11.02,2.16,0.95,2.7],["Pete Myers",1.82,1.17,1.17,0.55,0.07],["Rod Strickland",8.4,2.5,4.3,1.4,0.2],["Rolando Blackman",8.55,1.7,2.03,0.45,0.15],["Scott Brooks",1.5,0.5,0.8,0.6,0],["Stuart Gray",0.98,0.88,0.07,0.14,0.1],["Terry Cummings",7.8,4.5,0.9,0.5,0.2],["Tim McCormick",1.9,1.5,0.4,0.1,0],["Tony Campbell",7.53,2.7,1.18,0.68,0.07],["Trent Tucker",7.71,1.88,1.92,0.81,0.1],["Walter McCarty",1.8,0.7,0.4,0.2,0.3],["Willie Anderson",5,2.2,1.8,0.6,0.3],["Xavier McDaniel",13.7,5.6,1.8,0.7,0.3]]],
    ["NYK","2000s",[["Al Harrington",20.7,6.3,1.4,1.2,0.3],["Allan Houston",19.67,3.03,2.44,0.72,0.11],["Anfernee Hardaway",8.23,3.47,1.95,0.89,0.2],["Anthony Roberson",4.7,0.7,0.8,0.4,0],["Antonio Davis",5,4.8,0.4,0.6,0.3],["Bruno Šundov",1.24,0.57,0.14,0.1,0.1],["Channing Frye",10.83,5.64,0.85,0.5,0.65],["Charlie Ward",6.96,2.65,4.22,1.19,0.2],["Chris Childs",5.09,2.35,4.25,0.58,0.1],["Chris Dudley",1.2,2.9,0.1,0.1,0.4],["Chris Duhon",11.1,3.1,7.2,0.9,0.1],["Chris Wilcox",5.4,3.3,0.6,0.3,0.2],["Clarence Weatherspoon",7.12,7.39,0.97,0.79,0.61],["Danilo Gallinari",6.1,2,0.5,0.5,0.1],["David Lee",10.92,8.97,1.44,0.73,0.35],["DerMarr Johnson",5.4,1.9,0.5,0.4,0.3],["Dikembe Mutombo",5.6,6.7,0.4,0.3,1.9],["Eddy Curry",15.55,5.95,0.54,0.34,0.59],["Erick Strickland",4.3,1.9,1,0.8,0],["Felton Spencer",1.37,1.71,0.1,0.16,0.23],["Frank Williams",3.19,0.9,2.04,0.37,0.1],["Fred Jones",7.6,2.4,2.4,0.7,0.3],["Glen Rice",12,4.1,1.2,0.5,0.2],["Howard Eisley",7.4,1.98,4.54,0.82,0.1],["Jackie Butler",5.2,3.13,0.47,0.3,0.57],["Jalen Rose",12.7,3.2,2.6,0.4,0.1],["Jamal Crawford",17.63,2.88,4.38,1.09,0.2],["Jared Jeffries",4.31,3.84,1.14,0.68,0.45],["Jermaine Jackson",2,1.1,1.1,0.3,0],["Jerome James",2.48,1.8,0.2,0.11,0.44],["Jerome Williams",4.5,3.6,0.5,0.7,0.1],["John Wallace",6.5,2.3,0.4,0.2,0.2],["Keith Van Horn",16.4,7.3,1.8,1.1,0.4],["Kurt Thomas",11.51,8.13,1.47,0.82,0.93],["Larry Hughes",11.2,2.6,2.4,1.4,0.2],["Larry Johnson",10.31,5.5,2.26,0.6,0.24],["Latrell Sprewell",18.07,4.1,3.97,1.32,0.3],["Lavor Postell",3.2,0.75,0.22,0.24,0.04],["Lee Nailon",5.5,1.8,0.7,0.2,0.1],["Luc Longley",2,2.6,0.3,0.1,0.4],["Malik Rose",4.04,2.97,0.82,0.44,0.15],["Marcus Camby",11.12,9.98,0.86,0.92,2.03],["Mardy Collins",3.75,1.74,1.69,0.52,0.13],["Mark Jackson",7.75,3.88,6.93,0.85,0],["Maurice Taylor",6.36,3.4,0.71,0.33,0.23],["Michael Doleac",4.63,3.36,0.64,0.28,0.39],["Mike Sweetney",6.95,4.8,0.49,0.4,0.36],["Moochie Norris",3.5,1.14,1.58,0.66,0.1],["Nate Robinson",12.42,2.95,2.64,0.93,0.05],["Nazr Mohammed",10.3,7.97,0.53,1.07,0.97],["Othella Harrington",6.78,4.63,0.62,0.3,0.4],["Patrick Ewing",15,9.7,0.9,0.6,1.4],["Quentin Richardson",9.75,5.03,1.78,0.7,0.13],["Qyntel Woods",6.7,3.9,1,0.7,0.3],["Randolph Morris",2.6,2.03,0.12,0.24,0.12],["Renaldo Balkman",4.17,3.81,0.6,0.75,0.55],["Rick Brunson",1.73,0.73,1.07,0.17,0],["Shandon Anderson",7.06,2.96,1.16,0.8,0.2],["Stephon Marbury",18.24,2.93,6.96,1.22,0.1],["Steve Francis",11.12,3.39,3.76,0.94,0.3],["Tim Thomas",12.04,3.52,1.43,0.67,0.23],["Travis Knight",1.47,1.73,0.22,0.19,0.23],["Trevor Ariza",5.5,3.25,1.16,0.99,0.23],["Vin Baker",3.56,2.58,0.52,0.22,0.32],["Wilson Chandler",12.28,4.86,1.74,0.75,0.78],["Zach Randolph",18,10.6,1.92,0.94,0.21]]],
    ["NYK","2010s",[["Al Harrington",17.7,5.6,1.5,0.9,0.4],["Allonzo Trier",10.9,3.1,1.9,0.4,0.2],["Amar'e Stoudemire",17.31,6.72,1.31,0.64,1.13],["Andrea Bargnani",13.91,4.93,1.3,0.22,1.08],["Arron Afflalo",12.8,3.7,2,0.4,0.1],["Baron Davis",6.1,1.9,4.7,1.2,0.1],["Beno Udrih",5.6,1.8,3.5,0.7,0.1],["Brandon Jennings",8.6,2.6,4.9,0.9,0.1],["Carmelo Anthony",24.71,6.96,3.24,0.96,0.52],["Chauncey Billups",17.5,3.1,5.5,0.9,0.1],["Chris Copeland",8.7,2.1,0.5,0.3,0.2],["Chris Duhon",7.4,2.7,5.6,0.9,0],["Cleanthony Early",4.31,2.2,0.75,0.45,0.27],["Cole Aldrich",4,4.34,0.81,0.43,0.93],["Courtney Lee",10.91,3.09,2.27,1.07,0.25],["Damyean Dotson",8.22,2.96,1.39,0.61,0.06],["Danilo Gallinari",15.4,4.86,1.7,0.86,0.59],["David Lee",20.2,11.7,3.6,1,0.5],["Dennis Smith Jr.",14.7,2.8,5.4,1.3,0.4],["Derrick Rose",18,3.8,4.4,0.7,0.3],["Derrick Williams",9.3,3.7,0.9,0.4,0.1],["Doug McDermott",7.2,2.4,0.9,0.2,0.2],["Emmanuel Mudiay",13.17,3.11,3.9,0.75,0.3],["Enes Freedom",14.06,10.81,1.65,0.46,0.46],["Frank Ntilikina",5.83,2.19,3.06,0.76,0.24],["Henry Walker",6.74,2.38,0.94,0.52,0.13],["Iman Shumpert",7.85,3.55,2.21,1.31,0.16],["J.R. Smith",15.12,4.29,2.83,1.14,0.27],["James White",2.2,0.8,0.5,0.2,0.1],["Jared Jeffries",4.4,3.98,1.17,0.9,0.83],["Jarrett Jack",7.5,3.1,5.6,0.6,0.1],["Jason Kidd",6,4.3,3.3,1.6,0.3],["Jason Smith",8,4,1.7,0.4,0.5],["Jeremy Lin",14.6,3.1,6.2,1.6,0.3],["Jeremy Tyler",3.6,2.7,0.2,0.1,0.5],["Jerian Grant",5.6,1.9,2.3,0.7,0.1],["Jerome Jordan",2,1.3,0.2,0,0.3],["Joakim Noah",4.56,7.9,1.99,0.65,0.73],["John Jenkins",5.2,1.6,1,0,0.1],["Jonathan Bender",4.7,2.1,0.6,0.1,0.7],["Jordan Hill",4,2.5,0.3,0.4,0.4],["Josh Harrellson",4.4,3.9,0.3,0.6,0.5],["José Calderón",8.15,3.13,4.32,0.83,0.06],["Justin Holiday",7.7,2.7,1.2,0.8,0.4],["Kenyon Martin",5.34,4.6,1.17,0.84,0.84],["Kevin Knox",12.8,4.5,1.1,0.6,0.3],["Kevin Séraphin",3.9,2.6,1,0.2,0.8],["Kristaps Porziņģis",17.82,7.08,1.35,0.73,2.06],["Kurt Thomas",2.5,2.3,0.5,0.3,0.4],["Kyle O'Quinn",6.14,5.24,1.59,0.44,1.15],["Lance Thomas",6.05,2.59,0.79,0.46,0.16],["Landry Fields",9.3,5.42,2.21,1.09,0.24],["Langston Galloway",9.09,3.75,2.78,1.01,0.3],["Larry Hughes",9.6,3.5,3.5,1.3,0.4],["Lou Amundson",4.26,4.22,1.1,0.38,0.84],["Luke Kornet",6.91,2.99,1.23,0.51,0.87],["Marcus Camby",1.8,3.3,0.6,0.3,0.6],["Mario Hezonja",8.8,4.1,1.5,1,0.1],["Maurice Ndour",3.1,2,0.3,0.5,0.3],["Metta World Peace",4.8,2,0.6,0.8,0.3],["Michael Beasley",13.2,5.6,1.7,0.5,0.6],["Mike Bibby",2.6,1.5,2.1,0.5,0.1],["Mindaugas Kuzminskas",6.21,1.87,0.99,0.39,0.2],["Mitchell Robinson",7.3,6.4,0.6,0.8,2.4],["Nate Robinson",13.2,2.4,3.7,0.9,0.2],["Noah Vonleh",8.4,7.8,1.9,0.7,0.8],["Pablo Prigioni",3.88,1.89,3.04,1,0],["Quincy Acy",5.9,4.4,1,0.4,0.3],["Rasheed Wallace",7,4,0.3,0.6,0.7],["Raymond Felton",13.36,3.14,6.55,1.45,0.27],["Robin Lopez",10.3,7.3,1.4,0.2,1.6],["Roger Mason",2.9,1.7,0.8,0.2,0.1],["Ron Baker",3.23,1.46,1.83,0.74,0.18],["Ronnie Brewer",3.6,2.2,0.9,0.7,0.1],["Ronny Turiaf",4.2,3.2,1.4,0.5,1.1],["Samuel Dalembert",4,5.3,0.9,0.4,1.3],["Sasha Vujačić",4.13,1.99,1.32,0.48,0.06],["Sergio Rodríguez",7.4,1.4,3.4,0.8,0.1],["Shane Larkin",6.2,2.3,3,1.2,0.1],["Shawne Williams",7.1,3.7,0.7,0.6,0.8],["Steve Novak",7.48,1.9,0.32,0.3,0.14],["Tim Hardaway Jr.",13.81,2.59,1.85,0.65,0.15],["Timofey Mozgov",4,3.1,0.4,0.4,0.7],["Toney Douglas",9,2.41,2.46,0.94,0.03],["Toure' Murry",2.7,0.9,1,0.4,0],["Tracy McGrady",9.4,3.7,3.9,0.6,0.5],["Travis Wear",3.9,2.1,0.8,0.3,0.2],["Trey Burke",12.32,1.95,3.79,0.65,0.15],["Tyson Chandler",10.19,10.1,0.96,0.73,1.2],["Willy Hernangómez",7.17,5.83,1.17,0.52,0.45],["Wilson Chandler",15.78,5.62,1.92,0.7,1.06]]],
    ["NYK","2020s",[["P.J. Tucker",3,2.7,0,0.3,0.3],["Derrick Rose",10.8,2.4,3.3,0.7,0.4],["Taj Gibson",4.9,5,0.7,0.6,1],["Kemba Walker",11.6,3,3.5,0.7,0.2],["Alec Burks",11.6,3.9,2.2,0.7,0.3],["Bojan Bogdanovic",15.2,2.7,1.7,0.5,0.1],["Evan Fournier",10.1,2.2,1.7,0.8,0.2],["Nerlens Noel",4.2,6,0.8,1.1,1.7],["Reggie Bullock Jr.",10.9,3.4,1.5,0.8,0.2],["Norvel Pelle",1.5,1.5,0.2,0.1,0.7],["Elfrid Payton",10.1,3.4,3.2,0.7,0.1],["Jordan Clarkson",8.6,1.8,1.3,0.4,0.1],["Julius Randle",23.3,9.8,5,0.7,0.3],["Delon Wright",3.1,1.7,1.9,0.9,0.3],["Karl-Anthony Towns",22.2,12.4,3,0.9,0.6],["Cameron Payne",6.9,1.4,2.8,0.5,0.2],["Wayne Selden",1.7,0.3,0.3,0,0],["Ryan Arcidiacono",1,0.7,0.6,0.2,0],["Frank Ntilikina",2.7,0.9,0.6,0.5,0.1],["OG Anunoby",16.5,4.7,2.2,1.5,0.8],["Isaiah Hartenstein",6.4,7.4,1.9,0.9,1],["Josh Hart",11.2,8.3,4.7,1.2,0.3],["Damyean Dotson",2,1,0.5,0,0],["Mikal Bridges",16,3.5,3.7,1.1,0.7],["Jalen Brunson",26.2,3.3,6.8,0.9,0.2],["Donte DiVincenzo",15.5,3.7,2.7,1.3,0.4],["Kevin Knox II",3.9,1.5,0.5,0.3,0.1],["Shake Milton",4.5,1.6,1.3,0.4,0.1],["Mitchell Robinson",6.8,8.2,0.7,1,1.4],["Landry Shamet",7.5,1.5,0.9,0.6,0.1],["Theo Pinson",0.1,0.3,0.1,0,0],["Mamadi Diakite",2,0.7,0.3,0.2,0.2],["Jared Harper",0.4,0.3,0.1,0,0],["DaQuan Jeffries",0.8,0.3,0.3,0,0.1],["RJ Barrett",19.1,5.5,2.9,0.6,0.2],["Cam Reddish",10.1,2.1,1,1,0.3],["Quentin Grimes",8.7,2.6,1.6,0.7,0.3],["Isaiah Roby",4.1,2.6,0.9,0.4,0.2],["Charlie Brown Jr.",0.8,0.3,0,0,0.3],["Matt Mooney",0,0,0,1,0],["Tyler Hall",0,0,0,0,0],["Obi Toppin",6.8,2.9,0.9,0.3,0.3],["Precious Achiuwa",7.1,6.1,1.1,0.7,0.8],["Immanuel Quickley",12.5,3.2,3,0.7,0.1],["Miles McBride",7.1,1.7,1.9,0.7,0.1],["Ariel Hukporti",2,2.5,0.5,0.1,0.6],["Jericho Sims",2.5,4,0.5,0.3,0.5],["Duane Washington Jr.",7.9,1.2,2,0.2,0.1],["Feron Hunt",0,0.5,0.5,0.5,0],["Jose Alvarado",7.4,2.5,3.4,1,0.1],["MarJon Beauchamp",2.3,1.3,0.3,0.1,0],["Jeremy Sochan",3.6,2.4,0.9,0.4,0.2],["Jacob Toppin",1.4,0.8,0.3,0,0.1],["Trevor Keels",1,0.7,0,0,0],["Dmytro Skapintsev",0,0,0,0,0],["Kevin McCullar Jr.",1.9,1.6,0.8,0.3,0.1],["Dillon Jones",1.3,1,0.6,0.4,0],["Anton Watson",0.9,0.3,0.2,0.1,0],["Trey Jemison III",1,1.4,0.4,0.1,0.2],["Tyler Kolek",3.2,1.1,2.2,0.3,0.1],["Pacôme Dadiet",1.7,0.9,0.3,0.2,0.1],["Mohamed Diawara",3.6,1.4,0.8,0.2,0.1]]],
    ["OKC","1960s",[["Al Hairston",2.2,0.9,1,null,null],["Al Tucker",11.96,6.76,1.24,null,null],["Art Harris",12.4,3.8,3.2,null,null],["Bob Kauffman",7.8,5.9,1,null,null],["Bob Rule",21.05,10.5,1.45,null,null],["Bob Weiss",9.8,1.8,4.2,null,null],["Bud Olsen",3.8,2.8,1,null,null],["Dorie Murrey",6.76,6.28,0.74,null,null],["Erwin Mueller",7,4,2.4,null,null],["George Wilson",6.1,6.1,0.7,null,null],["Henry Akin",3.1,1.6,0.4,null,null],["Joe Kennedy",6.2,3.3,0.8,null,null],["John Tresvant",13.6,10.3,2.4,null,null],["Lenny Wilkens",22.4,6.2,8.2,null,null],["Plummer Lott",2.19,1.83,0.63,null,null],["Rod Thorn",14.07,3.66,3.29,null,null],["Tom Meschery",14.25,10.1,2.4,null,null],["Tommy Kron",7.4,3.75,3.1,null,null],["Walt Hazzard",24,4.2,6.2,null,null]]],
    ["OKC","1970s",[["Archie Clark",13.9,3.1,5.6,1.4,0.1],["Barry Clemens",7.59,3.57,1.16,null,null],["Bob Boozer",15.2,8.7,1.3,null,null],["Bob Love",4.1,2.7,0.7,0.4,0.1],["Bob Rule",22.01,9.24,1.58,null,null],["Bob Wilkerson",6.7,3.3,2.2,0.9,0.1],["Bruce Seals",10.28,4.65,1.24,0.67,0.57],["Bud Stallworth",6.3,2.76,0.66,0.3,0.2],["Butch Beard",6.6,2.4,3.4,null,null],["Dean Tolson",5.05,2.24,0.47,0.42,0.37],["Dennis Awtrey",2,2.6,1.2,0.3,0.2],["Dennis Johnson",12.59,4,2.6,1.43,0.83],["Dick Gibbs",10.8,3.1,1.1,0.5,0.3],["Dick Snyder",14.71,3.31,3.64,0.81,0.27],["Don Kojis",13.06,5.07,1.36,null,null],["Dorie Murrey",5.5,4.4,0.9,null,null],["Frank Oleynick",4.97,0.9,1.1,0.35,0.1],["Fred Brown",16.65,3.5,3.61,1.77,0.25],["Gar Heard",6.75,6.13,0.79,null,null],["Gus Williams",18.64,3.2,3.85,2.2,0.45],["Herm Gilliam",8.5,2.7,2.5,1,0.1],["Jack Sikma",13.15,10.35,2.4,0.9,0.65],["Jake Ford",4.03,0.63,1.13,null,null],["Jim Fox",10.57,8.96,2.37,0.65,0.25],["Jim McDaniels",6,5.19,1.02,0.3,0.6],["Joby Wright",3.9,2.8,0.5,null,null],["Joe Hassett",4.05,0.8,0.85,0.35,0.05],["John Brisker",11.87,3.99,1.76,0.61,0.16],["John Hummer",4.33,3.99,1.49,0.36,0.36],["John Johnson",10.86,4.52,3.63,0.65,0.3],["John Tresvant",12.6,7.4,1.9,null,null],["Kenny McIntosh",5.96,4.56,1.18,0.79,0.41],["Lee Winfield",8.67,2.28,2.89,null,null],["Lenny Wilkens",18.5,4.56,9.31,null,null],["Leonard Gray",12.41,5.92,2.56,0.96,0.41],["Lonnie Shelton",13.5,6.2,1.4,1,1],["Lucius Allen",9.8,2.6,4.2,null,null],["Marvin Webster",14,12.6,2.5,0.6,2],["Mike Bantom",8.04,5.04,1.38,0.56,0.44],["Mike Green",10.02,6.55,1.55,0.61,1.67],["Milt Williams",3.1,0.9,1.9,0.5,0],["Nick Weatherspoon",12.8,7.9,1,1,0.5],["Paul Silas",5.7,7.55,1.6,0.6,0.2],["Pete Cross",5.92,8.47,1.05,null,null],["Rod Derline",4.82,0.82,0.66,0.31,0.05],["Rod Thorn",4.97,1.41,2.44,null,null],["Slick Watts",10.08,3.56,6.78,2.48,0.22],["Spencer Haywood",24.93,12.13,2.34,0.85,1.5],["Tal Skinner",4.55,4.2,1.05,0.7,0.15],["Tom Black",5,4.1,0.8,null,null],["Tom Burleson",11.8,7.57,1.57,0.87,1.7],["Tom LaGarde",11,8.3,1.4,0.3,0.8],["Tom Meschery",10.81,7.21,1.7,null,null],["Wally Walker",6.55,3,1.09,0.31,0.24],["Walt Hazzard",3.8,1.2,2.5,0.5,0.1],["Wardell Jackson",4.3,2.4,0.5,0.5,0.1],["Willie Norwood",7.33,3.71,1.12,0.75,0.1],["Zaid Abdul-Aziz",10.63,8.22,1.24,0.3,0.6]]],
    ["OKC","1980s",[["Al Wood",13.65,3.34,2.17,0.87,0.44],["Alton Lister",8.31,7.82,0.95,0.33,2.09],["Armond Hill",4.3,1.84,2.76,0.63,0.17],["Avery Johnson",1.6,0.6,1.7,0.5,0.1],["Bill Hanzlik",5.61,2.73,1.92,0.9,0.35],["Clay Johnson",2.2,0.5,0.6,0.3,0.1],["Clemon Johnson",2.42,3.02,0.25,0.25,0.4],["Cory Blackwell",3.4,1.6,0.4,0.4,0.1],["Dale Ellis",26.07,4.74,2.5,1.21,0.27],["Danny Vranes",5.97,4.38,1.36,0.68,0.56],["Danny Young",4.96,1.33,3.71,1.01,0.03],["David Thompson",15.23,3.34,2.54,0.58,0.46],["Dennis Awtrey",2.2,2.3,1.1,0.3,0.2],["Dennis Johnson",19,5.1,4.1,1.8,1],["Derrick McKey",12.2,4.85,2,1.1,0.85],["Eddie Johnson",9,1.9,4.8,0.5,0],["Frank Brickowski",3.92,2.66,1.03,0.37,0.2],["Fred Brown",11.53,1.59,2.76,0.82,0.12],["George Johnson",0.9,1.5,0.3,0.1,0.9],["Gerald Henderson",13.17,2.32,6.45,1.72,0.1],["Greg Kelser",7.01,4.28,1.09,0.55,0.36],["Gus Williams",21.06,2.93,7.01,2.33,0.4],["Jack Sikma",17.91,10.97,3.55,1.11,1.07],["Jacky Dorsey",1.8,3,0.3,0.3,0],["James Bailey",9.62,5.34,0.87,0.61,1.26],["James Donaldson",7.56,5.6,0.81,0.21,1.35],["Jerry Reynolds",7.6,1.8,1.1,0.9,0.5],["John Johnson",10.82,4.61,4.36,0.76,0.34],["John Lucas",4.2,1.1,3.5,0.8,0],["Jon Sundvold",6.2,1.1,3.05,0.45,0],["Kevin Williams",5.67,1.47,1.11,0.76,0.1],["Lonnie Shelton",13.59,6.58,2.64,1.12,0.76],["Mark Radford",3.57,0.81,1.63,0.51,0.06],["Maurice Lucas",7.9,4.9,1,0.5,0.3],["Michael Cage",10.3,9.6,1.6,1.2,0.7],["Michael Phelps",3.54,1.07,1.05,0.51,0],["Nate McMillan",6.72,4.65,8.71,2.01,0.6],["Olden Polynice",3.51,3.31,0.35,0.45,0.35],["Paul Silas",3.8,5.3,0.8,0.3,0.1],["Paul Westphal",16.7,1.9,4.1,1.3,0.4],["Phil Smith",6.32,1.87,2.72,0.65,0.15],["Ray Tolbert",4.14,2.6,0.59,0.29,0.39],["Reggie King",5.61,4.3,1.69,0.61,0.26],["Ricky Sobers",8.75,1.4,2.87,0.65,0.05],["Russ Schoene",4.76,2.25,0.55,0.44,0.23],["Sam Vincent",4.5,1.1,3.2,0.5,0.1],["Scooter McCray",2.68,2.45,0.93,0.2,0.41],["Sedale Threatt",8.28,1.72,3.27,1.3,0.13],["Steve Hawes",4.21,3.22,1.27,0.3,0.2],["Steve Hayes",1.3,1.4,0.3,0.1,0.4],["Terence Stansbury",4,0.5,1.3,0.3,0],["Tim McCormick",9.05,5.15,1.05,0.2,0.4],["Tom Chambers",20.43,6.54,2.37,0.88,0.62],["Tom LaGarde",4.7,3.8,1.1,0.2,0.4],["Vinnie Johnson",9.54,3.43,3.21,0.84,0.18],["Wally Walker",7.71,3.55,1.78,0.47,0.23],["Xavier McDaniel",20.49,7.13,2.46,1.2,0.57]]],
    ["OKC","1990s",[["Aaron Williams",4.37,2.64,0.35,0.34,0.6],["Avery Johnson",2.6,0.8,3.1,0.5,0],["Bart Kofoed",1.5,0.6,1.2,0,0],["Benoit Benjamin",11.92,7.01,1.08,0.65,1.65],["Bill Cartwright",2.4,3,0.3,0.2,0.1],["Billy Owens",7.8,3.8,1.8,0.6,0.2],["Brad Sellers",4.8,1.6,0.7,0.2,0.4],["Byron Houston",3.4,1.4,0.2,0.3,0.1],["Craig Ehlo",3.5,1.8,1.1,0.6,0.1],["Dale Ellis",14.95,2.95,1.41,0.85,0.1],["Dana Barros",8.12,1.36,2.04,0.66,0.03],["Dave Corzine",1.7,1.2,0.1,0.2,0.2],["David Wingate",3.32,1.13,0.94,0.47,0.1],["Derrick McKey",14.82,5.34,2.38,1.23,0.88],["Detlef Schrempf",16.56,6.29,4,0.92,0.26],["Dontonio Wingfield",2.3,1.5,0.2,0.3,0.2],["Eddie Johnson",16.22,3.43,1.68,0.59,0.06],["Eric Snow",2.7,0.89,1.95,0.55,0.01],["Ervin Johnson",4,4.39,0.4,0.36,1.14],["Frank Brickowski",5.4,2.4,0.9,0.4,0.1],["Gary Payton",16.35,3.84,6.83,2.29,0.22],["Gerald Paddio",3.9,1.2,0.8,0.3,0.1],["Greg Anthony",5.2,1.4,2.6,0.8,0],["Greg Graham",3.3,0.5,0.4,0.4,0],["Hersey Hawkins",12.82,3.89,2.75,1.79,0.21],["Jelani McCoy",5.1,3,0.2,0.4,0.8],["Jerome Kersey",6.3,3.6,1.2,1.4,0.4],["Jim Farmer",6.4,1.1,0.7,0.4,0],["Jim McIlvaine",3.51,3.66,0.25,0.4,1.9],["John Crotty",6.1,1.3,2.4,0.4,0],["Kendall Gill",13.91,3.69,3.07,1.76,0.4],["Larry Stewart",4.3,2.4,0.7,0.4,0.3],["Marty Conlon",2.7,1.5,0.3,0.2,0.2],["Michael Cage",7.12,7.82,0.88,1,0.6],["Nate McMillan",5.63,3.81,5.15,1.94,0.41],["Olden Polynice",6.47,5.69,0.42,0.38,0.41],["Quintin Dailey",6.48,1.35,0.74,0.33,0.02],["Rashard Lewis",2.4,1.3,0.2,0.4,0.1],["Rich King",1.87,1,0.29,0.06,0.09],["Ricky Pierce",18.46,2.44,2.65,1.05,0.17],["Sam Perkins",11.08,4.19,1.4,0.87,0.53],["Scott Meents",1.83,1.07,0.4,0.3,0.17],["Sedale Threatt",12.12,1.47,3.36,1.22,0.1],["Shawn Kemp",16.24,9.58,1.74,1.24,1.54],["Steve Johnson",5.6,2.4,0.8,0.1,0.2],["Steve Scheffler",2.04,0.94,0.16,0.17,0.04],["Terry Cummings",8.2,4.1,0.9,0.7,0.2],["Tony Brown",4.8,1.6,0.9,0.5,0.1],["Vin Baker",17.62,7.47,1.81,1.04,1],["Vincent Askew",8.43,2.57,2.29,0.73,0.22],["Vladimir Stepania",5.5,3.3,0.5,0.4,1],["Xavier McDaniel",21.39,6.3,2.5,1.21,0.46],["Šarūnas Marčiulionis",9.3,1,1.7,1.1,0]]],
    ["OKC","2000s",[["Andre Brown",2.4,1.9,0.1,0.2,0.1],["Ansu Sesay",3.17,1.65,0.43,0.3,0.26],["Antonio Daniels",9.64,2.15,4.15,0.65,0.05],["Art Long",4.5,4,0.7,0.3,0.4],["Brent Barry",11.35,4.22,4.61,1.45,0.33],["Calvin Booth",4.34,3.3,0.44,0.22,1.1],["Chris Wilcox",12.65,7.14,1.07,0.73,0.48],["Chuck Person",2.8,1.4,0.6,0.1,0.1],["Damien Wilkins",7.59,2.57,1.54,0.87,0.21],["Danny Fortson",5.99,4.74,0.1,0.19,0.09],["Delonte West",6.8,2.7,3.2,0.9,0.3],["Desmond Mason",9.9,4.47,1.26,0.69,0.43],["Earl Watson",8.08,2.41,5.21,0.99,0.17],["Emanual Davis",4.96,2.22,1.78,0.86,0.15],["Francisco Elson",3,3,0.4,0.3,0.3],["Gary Payton",22.72,5.22,8.7,1.72,0.25],["Greg Foster",3.4,1.8,0.7,0.2,0.3],["Horace Grant",8.1,7.8,2.5,0.7,0.8],["Jeff Green",13.46,5.69,1.75,0.8,0.5],["Jelani McCoy",4.41,3.37,0.62,0.3,0.75],["Jerome James",5.12,3.62,0.38,0.3,1.33],["Joe Smith",6.6,4.5,0.7,0.3,0.7],["Johan Petro",5.72,4.5,0.4,0.49,0.62],["Kenny Anderson",6.1,2.3,3.2,1.1,0],["Kevin Durant",22.7,5.41,2.59,1.14,0.8],["Kevin Ollie",8,2.9,3.8,1.1,0],["Kurt Thomas",7.5,8.8,1.3,0.8,1],["Kyle Weaver",5.3,2.3,1.8,0.8,0.4],["Luke Ridnour",9.06,2.23,5.02,1.09,0.25],["Malik Rose",5,3.3,1.3,0.5,0.1],["Mateen Cleaves",2.09,0.47,1.22,0.1,0.07],["Mickaël Gelabale",4.49,2.14,0.8,0.3,0.26],["Mike Wilks",3.75,1.08,1.65,0.35,0.08],["Mikki Moore",3.3,2.8,0.6,0.1,0.3],["Mouhamed Sene",2.18,1.51,0.03,0.08,0.43],["Nenad Krstić",9.7,5.5,0.6,0.5,1.1],["Nick Collison",8.15,6.95,0.95,0.52,0.69],["Olumide Oyedeji",1.5,2.2,0.1,0.15,0.19],["Patrick Ewing",9.6,7.4,1.2,0.7,1.2],["Predrag Drobnjak",8.26,3.68,0.91,0.47,0.5],["Rashard Lewis",17.09,5.98,1.75,1.18,0.62],["Ray Allen",24.57,4.64,4.2,1.31,0.16],["Reggie Evans",4.05,7.09,0.55,0.66,0.16],["Richie Frahm",3.4,1,0.4,0.3,0.1],["Robert Swift",4.28,3.86,0.2,0.26,0.9],["Ronald Murray",10.16,2.17,2.16,0.77,0.22],["Ruben Patterson",12.28,5.21,1.84,1.3,0.55],["Rubén Wolkowyski",2.2,1.4,0.1,0.2,0.5],["Russell Westbrook",15.3,4.9,5.3,1.3,0.2],["Shammond Williams",5.63,1.53,2.2,0.4,0.04],["Thabo Sefolosha",8.5,5.2,2,1.7,1.1],["Vernon Maxwell",10.9,1.7,1.6,0.8,0.2],["Vin Baker",14.35,6.64,1.49,0.51,0.85],["Vitaly Potapenko",5.1,3.49,0.5,0.25,0.27],["Vladimir Radmanović",10.13,4.51,1.47,0.89,0.41],["Vladimir Stepania",2.5,1.6,0.1,0.3,0.4],["Wally Szczerbiak",13.1,2.7,1.4,0.3,0.1]]],
    ["OKC","2010s",[["Abdel Nader",4,1.9,0.3,0.3,0.2],["Andre Roberson",4.6,4.03,0.87,0.92,0.66],["Anthony Morrow",7.72,1.55,0.58,0.53,0.1],["Byron Mullens",1.5,1.3,0.05,0.2,0.1],["Cameron Payne",5.08,1.53,1.93,0.57,0.13],["Carmelo Anthony",16.2,5.8,1.3,0.6,0.6],["Caron Butler",9.7,3.2,1.2,1.1,0.3],["Cole Aldrich",1.71,1.84,0.14,0.3,0.52],["D.J. Augustin",5.6,1.71,2.44,0.49,0.05],["D.J. White",3.52,2.16,0.23,0.33,0.3],["Daequan Cook",5.54,1.93,0.39,0.36,0.11],["Dakari Johnson",1.8,1.1,0.3,0.2,0.3],["DeAndre Liggins",1.5,1.4,0.4,0.5,0.1],["Dennis Schröder",15.5,3.6,4.1,0.8,0.2],["Deonte Burton",2.6,0.9,0.3,0.2,0.3],["Derek Fisher",4.94,1.38,1.27,0.79,0.02],["Dion Waiters",10.89,2.71,1.96,1,0.2],["Domantas Sabonis",5.9,3.6,1,0.5,0.4],["Doug McDermott",6.6,2.2,0.6,0.1,0],["Enes Freedom",14.21,7.96,0.7,0.37,0.45],["Eric Maynor",4.01,1.35,2.84,0.42,0.07],["Etan Thomas",3.3,2.8,0,0.2,0.7],["Hamidou Diallo",3.7,1.9,0.3,0.4,0.2],["Hasheem Thabeet",2.09,2.66,0.15,0.42,0.77],["Ish Smith",1.2,0.9,0.9,0.1,0],["James Harden",12.7,3.42,2.45,1.07,0.27],["Jeff Green",15.14,5.85,1.67,1.11,0.71],["Jerami Grant",9.16,3.91,0.77,0.53,1.1],["Jeremy Lamb",6.96,2.12,1.11,0.51,0.21],["Joffrey Lauvergne",5.7,3.7,1,0.4,0.1],["Josh Huestis",2.46,2.34,0.31,0.19,0.61],["Kendrick Perkins",4.25,5.92,1.14,0.44,0.88],["Kevin Durant",28.87,7.58,4.02,1.23,1.05],["Kevin Martin",14,2.3,1.4,0.9,0.1],["Kevin Ollie",1.8,1,0.8,0.4,0],["Kyle Singler",3.19,1.85,0.42,0.35,0.15],["Lance Thomas",5.1,3.4,0.9,0.5,0],["Lazar Hayward",1.4,0.6,0.2,0.1,0],["Markieff Morris",6.5,3.8,0.8,0.5,0.1],["Mitch McGary",4.38,3.55,0.32,0.35,0.35],["Nazr Mohammed",3.74,3.14,0.22,0.39,0.52],["Nenad Krstić",8.09,4.77,0.59,0.4,0.52],["Nerlens Noel",4.9,4.2,0.6,0.9,1.2],["Nick Collison",4.27,3.9,1.09,0.46,0.38],["Patrick Patterson",3.77,2.36,0.61,0.47,0.26],["Paul George",24.91,6.93,3.69,2.1,0.45],["Perry Jones",3.42,1.75,0.37,0.23,0.24],["Randy Foye",5.6,1.9,1.8,0.5,0.5],["Raymond Felton",6.15,1.64,2.24,0.51,0.2],["Reggie Jackson",8.97,3,3,0.75,0.11],["Royal Ivey",1.83,0.65,0.29,0.3,0],["Russell Westbrook",23.82,7.27,8.76,1.79,0.34],["Semaj Christon",2.9,1.4,2,0.4,0.1],["Serge Ibaka",11.54,7.39,0.57,0.44,2.47],["Steve Novak",1.62,0.53,0.26,0,0.06],["Steven Adams",9.68,7.39,1.02,0.89,1],["Taj Gibson",9,4.5,0.6,0.6,0.7],["Terrance Ferguson",5.18,1.4,0.68,0.45,0.2],["Thabo Sefolosha",6.08,4.04,1.5,1.2,0.48],["Timothé Luwawu-Cabarrot",1.7,0.9,0.2,0.2,0],["Victor Oladipo",15.9,4.3,2.6,1.2,0.3],["Álex Abrines",5.31,1.42,0.51,0.5,0.12]]],
    ["OKC","2020s",[["Derrick Favors",5.3,4.7,0.6,0.4,0.3],["Gordon Hayward",9.8,3.5,3.1,0.8,0.3],["Bismack Biyombo",4.4,5.2,1.3,0.3,0.9],["Kemba Walker",19.3,4,4.9,1.1,0.3],["Darius Miller",4.1,1.3,1.2,0.7,0.3],["Mike Muscala",6.9,3.1,0.7,0.3,0.4],["Scotty Hopson",4,1,1,0,0],["Dario Saric",6.4,3.6,1.3,0.4,0.1],["Alex Caruso",6.7,2.8,2.2,1.5,0.4],["Isaiah Hartenstein",10.2,10.1,3.6,0.9,1],["Tony Bradley",7.1,5.7,0.9,0.4,0.7],["Paul Watson",3.4,3,0.9,0.3,0.3],["Melvin Frazier Jr.",10.7,4.3,0.3,0.3,0],["Shai Gilgeous-Alexander",28.9,4.9,6.1,1.5,0.9],["Svi Mykhailiuk",8.5,2.5,1.7,0.8,0.2],["Kenrich Williams",6.8,3.9,1.8,0.7,0.2],["Mamadi Diakite",4.3,4.5,0.2,0.4,0.7],["Justin Robinson",2.3,0.8,1,0.3,0],["Darius Bazley",12.2,6.8,1.6,0.7,0.8],["Luguentz Dort",12.4,3.9,1.6,1,0.4],["Jaylen Hoard",10.4,7.7,1.9,0.8,0.5],["Ty Jerome",8.9,2.2,3,0.6,0.2],["Isaiah Roby",9.4,5.2,1.7,0.9,0.7],["Charlie Brown Jr.",4.4,1.9,1,0.4,0.2],["Theo Maledon",8.6,2.9,2.9,0.8,0.2],["Aleksej Pokusevski",8,4.9,2.1,0.5,0.9],["Isaiah Joe",9.8,2.5,1.4,0.6,0.2],["Jared Butler",6.2,0.7,1.3,0.8,0],["Josh Hall",4.1,2.8,1.3,0.2,0],["Vít Krejčí",6.2,3.4,1.9,0.6,0.3],["Zavier Simpson",11,5.3,7.5,1.3,1],["Rob Edwards",1.5,1.5,0,0,0],["Lindy Waters III",5.6,1.9,0.8,0.4,0.3],["Gabriel Deck",5.5,2.5,1.5,0.5,0],["Jeremiah Robinson-Earl",7.2,4.9,1,0.6,0.3],["Tre Mann",9.1,2.6,1.6,0.7,0.2],["Josh Giddey",13.8,7.4,5.8,0.8,0.5],["Aaron Wiggins",8.7,3.2,1.4,0.7,0.2],["Georgios Kalaitzakis",6.6,1.6,0.9,0.8,0.2],["Olivier Sarr",4.4,3.3,0.5,0.1,0.6],["Chet Holmgren",16.2,8.3,2,0.6,2.1],["Jalen Williams",18,4.6,4.6,1.3,0.5],["Jaylin Williams",5.8,4.8,2,0.5,0.4],["Ousmane Dieng",4.2,2.1,1,0.4,0.2],["Buddy Boeheim",1.5,0,0,0,0],["Jack White",1.5,3,0.3,1,0.3],["Cason Wallace",7.9,2.9,2.2,1.5,0.5],["Adam Flagler",1.6,0.3,1.1,0.1,0.1],["Keyontae Johnson",1.2,1.1,0.4,0.1,0],["Dillon Jones",2.5,2.2,1.1,0.3,0.1],["Nikola Topić",5.2,1.9,4.4,0.5,0],["Jared McCain",8.3,2,1.3,0.5,0.1],["Ajay Mitchell",10.1,2.6,2.7,0.9,0.2],["Payton Sandfort",8.8,2.5,0,0.3,0],["Branden Carlson",4.8,2.4,0.6,0.2,0.6],["Malevy Leons",0.3,0.5,0.2,0,0],["Alex Ducas",1.7,1.2,0.2,0.2,0],["Brooks Barnhizer",1.7,2,0.6,0.3,0.1]]],
    ["ORL","1990s",[["Anfernee Hardaway",19,4.77,6.35,1.94,0.51],["Anthony Avent",3.56,4.25,0.67,0.4,0.55],["Anthony Bowie",6.95,2.34,2.02,0.66,0.28],["B.J. Armstrong",2.2,1,1.5,0.4,0],["Bison Dele",7.73,4.79,0.55,0.84,1.01],["Bo Outlaw",8.68,7.14,2.38,1.3,1.98],["Brian Evans",3.9,1.59,0.65,0.4,0.18],["Brian Shaw",6.73,2.87,4.6,0.87,0.2],["Brooks Thompson",3.61,0.65,1.01,0.35,0.05],["Chris Corchiani",4.96,1.4,2.65,0.87,0],["Danny Schayes",4.13,2.78,0.45,0.38,0.36],["Darrell Armstrong",8.79,2.3,4.16,1.3,0.09],["David Benoit",5.8,2.6,0.3,0.4,0.2],["David Vaughn",2.11,2.55,0.2,0.2,0.45],["Dennis Scott",14.83,3.08,2.31,0.97,0.33],["Derek Harper",8.6,1.6,3.5,1.1,0.2],["Derek Strong",9.01,6.02,0.78,0.5,0.26],["Dominique Wilkins",5,2.6,0.6,0.1,0],["Donald Royal",7.81,3.41,1.32,0.57,0.22],["Gerald Wilkins",7.95,1.75,1.65,0.59,0.15],["Greg Kite",3.03,5.08,0.47,0.28,0.66],["Horace Grant",12.12,8.68,2.32,1.11,1.11],["Isaac Austin",9.7,4.8,1.8,1,0.7],["Jeff Turner",6.5,3.63,1.11,0.32,0.15],["Jerry Reynolds",12.67,3.96,2.76,1.32,0.73],["Joe Wolf",4.6,2.9,1,0.2,0.1],["Jon Koncak",3,4.1,0.8,0.4,0.7],["Kevin Ollie",3.94,0.9,1.61,0.38,0],["Larry Krystkowiak",5.1,3.6,1,0.4,0.1],["Litterial Green",3.78,0.59,1.52,0.33,0.06],["Mark Acres",3.96,4.83,0.52,0.44,0.3],["Mark Price",9.5,2,4.7,0.8,0.1],["Matt Harpring",8.2,4.3,0.9,0.6,0.1],["Michael Ansley",7.25,4.42,0.5,0.35,0.15],["Michael Doleac",6.2,3,0.4,0.4,0.3],["Morlon Wiley",4.35,0.92,2.41,0.86,0.05],["Nick Anderson",15.38,5.29,2.79,1.46,0.49],["Otis Smith",11.43,4.13,1.93,1.02,0.55],["Reggie Theus",18.9,2.9,5.4,0.8,0.2],["Rony Seikaly",16.41,8.76,1.32,0.62,1.17],["Sam Vincent",10.08,2.68,4.62,0.84,0.18],["Scott Skiles",12.94,2.89,7.24,0.86,0.06],["Sean Higgins",8.6,2.9,1.2,0.4,0.2],["Shaquille O'Neal",27.19,12.51,2.43,0.79,2.78],["Sidney Green",10.4,8.1,1.4,0.7,0.4],["Stanley Roberts",10.4,6.1,0.7,0.4,1.5],["Steve Kerr",2.6,0.8,1.3,0.2,0],["Terry Catledge",15.33,6.75,1.09,0.59,0.18],["Tom Tolbert",8.1,5.7,1.3,0.5,0.3],["Tree Rollins",1.43,1.99,0.2,0.15,0.75]]],
    ["ORL","2000s",[["Adonal Foyle",1.9,2.54,0.19,0.18,0.54],["Andrew DeClercq",3.61,3.76,0.54,0.55,0.46],["Anthony Johnson",4.95,1.6,2.17,0.6,0.1],["Ben Wallace",4.8,8.2,0.8,0.9,1.6],["Bo Outlaw",5.14,5.48,2.04,1.03,1.25],["Brandon Hunter",3.1,2.2,0.1,0.1,0.2],["Brian Cook",4.36,1.91,0.4,0.17,0.2],["Carlos Arroyo",7.91,1.91,3.09,0.5,0],["Chris Gatling",13.3,6.6,0.9,1.1,0.2],["Chris Whitney",3.5,1,1,0.5,0],["Chucky Atkins",9.5,1.5,3.7,0.6,0],["Corey Maggette",8.4,3.9,0.8,0.3,0.3],["Cory Alexander",2,1,1.4,0.6,0],["Courtney Lee",8.4,2.3,1.2,1,0.2],["Cuttino Mobley",16,2.7,1.8,1,0.4],["Darko Miličić",7.89,5.12,1.1,0.55,1.88],["Darrell Armstrong",13.42,3.83,5.6,1.85,0.15],["DeShawn Stevenson",9.95,2.83,1.84,0.6,0.17],["Derek Strong",2.7,2.2,0.2,0.3,0.1],["Don Reid",3.25,3.14,0.35,0.35,0.7],["Donnell Harvey",4.1,3,0.3,0.4,0.5],["Doug Christie",5.7,2.6,2.2,1.8,0.2],["Drew Gooden",11.99,6.87,1.1,0.8,0.86],["Dwight Howard",17.32,12.55,1.4,0.9,1.99],["Gordan Giriček",11.68,3.9,1.99,0.97,0.16],["Grant Hill",16.42,4.92,3.09,1.09,0.38],["Hedo Türkoğlu",15.82,4.61,3.7,0.85,0.26],["Horace Grant",7.83,6.01,1.4,0.79,0.56],["Jacque Vaughn",5.9,1.5,2.9,0.8,0],["Jameer Nelson",12.3,3.03,4.51,1,0.08],["Jeryl Sasser",2.5,2.37,0.85,0.58,0.18],["John Amaechi",9.18,3.3,1.05,0.35,0.45],["Jud Buechler",1.8,1.8,0.5,0.3,0.1],["Juwan Howard",17,7,2,0.7,0.3],["Keith Bogans",6.81,3.13,1.17,0.61,0.08],["Kelvin Cato",6.13,5.62,0.46,0.74,1.06],["Keyon Dooling",8.38,1.42,1.87,0.74,0.14],["Marcin Gortat",3.73,4.34,0.21,0.29,0.75],["Mario Kasun",2.72,2.53,0.16,0.16,0.22],["Maurice Evans",9.3,3.1,1,0.6,0.1],["Michael Doleac",6.71,3.81,0.8,0.45,0.45],["Mickaël Piétrus",9.4,3.3,1.2,0.6,0.4],["Mike Miller",14.11,4.55,2.43,0.66,0.29],["Monty Williams",6.87,3.25,1.25,0.56,0.23],["Olumide Oyedeji",1,1.9,0.2,0.2,0.1],["Pat Burke",4.3,2.4,0.4,0.3,0.4],["Pat Garrity",7.41,2.7,0.82,0.48,0.19],["Patrick Ewing",6,4,0.5,0.3,0.7],["Rafer Alston",12,2.9,5.1,1.8,0.1],["Rashard Lewis",17.95,5.55,2.5,1.1,0.55],["Reece Gaines",1.8,1,1.1,0.3,0.1],["Rod Strickland",6.8,2.6,4,0.6,0.2],["Ron Mercer",15.2,3.2,1.7,1.4,0.3],["Ryan Humphrey",1.8,2,0.2,0.1,0.5],["Sean Rooks",3.1,2.4,0.9,0.3,0.3],["Shammond Williams",4.9,1.2,1.7,0.6,0],["Shawn Kemp",6.8,5.7,0.7,0.8,0.4],["Stacey Augmon",2.91,1.68,0.66,0.36,0.14],["Steve Francis",19.41,5.43,6.52,1.29,0.33],["Steven Hunter",3.51,2.48,0.16,0.15,1.03],["Tariq Abdul-Wahad",12.2,5.2,1.6,1.2,0.3],["Terence Morris",1.6,1.7,0.2,0.3,0.2],["Tony Battie",5.94,5.01,0.5,0.43,0.66],["Tracy McGrady",28.11,7.01,5.21,1.55,0.99],["Travis Diener",3.8,0.79,1.02,0.25,0],["Trevor Ariza",7.22,4.01,0.96,0.87,0.25],["Troy Hudson",8.38,1.61,2.67,0.6,0.05],["Tyronn Lue",9.33,2.24,3.7,0.69,0.08],["Zaza Pachulia",3.3,2.9,0.2,0.4,0.2]]],
    ["ORL","2010s",[["Aaron Gordon",12.45,6.22,2.15,0.76,0.64],["Andrew Nicholson",6.48,3.23,0.46,0.23,0.35],["Anthony Johnson",4.2,1.5,2,0.4,0],["Arron Afflalo",13.5,2.96,2.55,0.42,0.12],["Ben Gordon",6.2,1.1,0.9,0.3,0],["Beno Udrih",10.2,2.3,6.1,0.9,0],["Bismack Biyombo",5.85,6.35,0.85,0.3,1.15],["Brandon Bass",9.06,4.37,0.64,0.32,0.62],["Brandon Jennings",7,2,4,0.7,0.2],["C.J. Watson",4.43,1.61,2.11,0.67,0.07],["C.J. Wilcox",1,0.5,0.5,0.1,0],["Channing Frye",6.52,3.64,1.19,0.56,0.5],["Chris Duhon",3.22,1.33,2.36,0.47,0.06],["D.J. Augustin",9.95,2.04,3.95,0.57,0],["Damjan Rudež",1.8,0.6,0.4,0.3,0],["DeQuan Jones",3.7,1.7,0.3,0.3,0.3],["Devyn Marble",2.17,1.58,0.65,0.54,0.04],["Dewayne Dedmon",4.01,4.51,0.19,0.36,0.8],["Doron Lamb",3.48,0.99,0.71,0.23,0],["Dwight Howard",20.56,13.86,1.68,1.23,2.48],["E'Twaun Moore",7.03,1.94,2.03,0.75,0.25],["Earl Clark",3.29,2.67,0.32,0.26,0.62],["Elfrid Payton",11.15,4.19,6.44,1.36,0.34],["Ersan İlyasova",8.1,5.5,0.5,0.6,0.3],["Evan Fournier",15.51,2.99,2.9,0.94,0.09],["Gilbert Arenas",8,2.4,3.2,0.9,0.2],["Glen Davis",11.61,6.13,1.37,0.84,0.44],["Gustavo Ayón",3.6,3.3,1.4,0.3,0.3],["Hedo Türkoğlu",10.4,4.04,4.52,0.88,0.33],["Isaiah Briscoe",3.5,1.9,2.2,0.3,0.1],["Ish Smith",2.36,1.3,1.6,0.47,0.16],["Jameer Nelson",12.85,3.24,6.28,0.9,0.06],["Jarell Martin",2.7,1.7,0.4,0.1,0.2],["Jason Maxiell",3.2,2.5,0.3,0.2,0.6],["Jason Richardson",12.76,3.8,2,1.1,0.3],["Jason Smith",7.2,2.9,0.8,0.4,0.9],["Jason Williams",5.36,1.48,3.26,0.58,0],["Jeff Green",9.2,3.1,1.2,0.5,0.2],["Jerian Grant",4.2,1.6,2.6,0.7,0.1],["Jodie Meeks",9.1,2.1,1.3,0.9,0.1],["Jonathan Isaac",8.49,5.02,0.99,0.91,1.25],["Jonathon Simmons",11.29,3.09,2.43,0.65,0.24],["Josh McRoberts",3.9,3.3,1.7,0.2,0.3],["Khem Birch",4.53,4.03,0.8,0.4,0.55],["Kyle O'Quinn",5.41,4.38,1.06,0.47,0.9],["Luke Ridnour",4,1.4,2,0.4,0.1],["Marcin Gortat",3.69,4.32,0.32,0.22,0.88],["Mario Hezonja",6.94,2.71,1.28,0.71,0.27],["Marreese Speights",7.7,2.6,0.8,0.2,0.4],["Matt Barnes",8.8,5.5,1.7,0.7,0.4],["Maurice Harkless",6.83,3.51,0.8,1.09,0.59],["Mickaël Piétrus",8.3,2.84,0.66,0.66,0.36],["Mo Bamba",6.2,5,0.8,0.3,1.4],["Nikola Vučević",16.76,10.71,2.65,0.91,0.97],["Quentin Richardson",4.45,2.87,0.75,0.49,0.1],["Rashard Lewis",13.61,4.35,1.42,1.05,0.4],["Ronnie Price",2.4,1.4,2.1,0.8,0.1],["Ryan Anderson",11.41,5.44,0.77,0.56,0.4],["Serge Ibaka",15.1,6.8,1.1,0.6,1.6],["Shabazz Napier",3.7,1,1.8,0.4,0],["Shelvin Mack",6.9,2.4,3.9,0.8,0.1],["Terrence Ross",13.43,3.28,1.7,1.03,0.44],["Tobias Harris",15.57,6.97,1.74,0.9,0.61],["Victor Oladipo",15.82,4.36,4.04,1.63,0.53],["Vince Carter",16.26,3.95,3.05,0.75,0.18],["Von Wafer",5.9,1.4,0.9,0.3,0.1],["Wes Iwundu",4.38,2.46,1,0.45,0.25],["Willie Green",5.9,1.5,1.3,0.5,0.1]]],
    ["ORL","2020s",[["Robin Lopez",7.1,3.5,1.5,0.1,0.5],["Cory Joseph",3.5,1.5,1.4,0.5,0.1],["Terrence Ross",12.8,3,2,0.7,0.3],["Michael Carter-Williams",6.6,2.9,3,0.6,0.4],["Otto Porter Jr.",9.7,5.4,2,0.6,0.1],["James Ennis III",8.4,4,1.5,0.8,0.2],["Gary Harris",7.8,1.8,1.4,0.8,0.3],["Joe Ingles",4.4,2.1,3,0.6,0.1],["Chasson Randle",6.5,2,1.8,0.5,0.1],["Markelle Fultz",11.4,3.2,4.8,1.1,0.3],["Jonathan Isaac",5,3.9,0.5,0.8,0.8],["D.J. Wilson",5,1,1,0,1],["Dwayne Bacon",10.9,3.1,1.3,0.6,0.1],["Frank Mason III",6.3,3,3,0,0],["Sindarius Thornwell",2,0.9,1,0.6,0.1],["Mo Bamba",9.3,6.9,1,0.4,1.5],["Jevon Carter",6.4,1.7,1.6,0.8,0.2],["Wendell Carter Jr.",12.2,8.2,2.1,0.7,0.6],["Moritz Wagner",9.5,4,1.2,0.5,0.3],["Goga Bitadze",5.6,4.9,1.4,0.6,1.1],["BJ Johnson",6.5,3.8,0,0,0.3],["Robert Franks",6.1,2,0.7,0.4,0.4],["Bol Bol",5.8,3.6,0.7,0.2,0.7],["Chuma Okeke",5.8,3.6,1.4,0.8,0.4],["Jordan Bone",4,1.7,1.3,0.1,0],["Ignas Brazdeikis",6,2.6,1.1,0.2,0.2],["Admiral Schofield",3,1.6,0.6,0.1,0.1],["Donta Hall",5.6,4.8,0.8,0.4,0.8],["Hassani Gravett",6.3,2.6,2.5,0.6,0.1],["Devin Cannady",7.2,0.9,1.1,0.8,0.3],["Cole Anthony",13.4,4.7,4.2,0.7,0.4],["R.J. Hampton",7.2,3.2,2.1,0.6,0.2],["Jay Scrubb",6.5,3,0.5,1,0],["Karim Mane",1.1,1.4,0.4,0,0.2],["Desmond Bane",19.6,5.1,4.7,1.1,0.5],["Trevelin Queen",3.9,1.5,1.2,0.8,0.3],["Freddie Gillespie",2.3,4,0.6,0.3,1],["Kevon Harris",3,1.6,0.5,0.2,0.1],["Jeff Dowtin Jr.",2.1,2,1.1,0.6,0.1],["Franz Wagner",19.7,5,3.6,1,0.3],["Jalen Suggs",12.9,3.5,3.8,1.4,0.6],["Mac McClung",0,0.5,1.5,0,0],["Colin Castleton",1.3,2,0.3,0.3,0],["Aleem Ford",2.8,3,0.4,0.2,0],["Paolo Banchero",22.7,7.4,4.8,0.8,0.6],["Orlando Robinson",1.8,1,0.8,0.3,0],["Caleb Houstan",4.1,1.5,0.6,0.3,0.1],["Jamal Cain",5.4,2,0.7,0.3,0.1],["Alex Morales",2,0.8,1,0,0],["Anthony Black",9.7,2.9,2.7,1,0.5],["Jett Howard",3.9,1.1,0.6,0.2,0.2],["Tristan da Silva",8.6,3.5,1.6,0.7,0.2],["Jase Richardson",4.4,1.2,1.1,0.4,0],["Noah Penda",3.8,3.2,1.2,0.5,0.3]]],
    ["PHI","1960s",[["Al Bianchi",7.73,2.25,2.33,null,null],["Archie Clark",13.5,3.2,3.6,null,null],["Barney Cable",6.58,5.18,0.94,null,null],["Ben Warley",6.4,5.76,0.75,null,null],["Bill Melchionni",4.45,1.4,1.4,null,null],["Billy Cunningham",19.16,8.84,2.78,null,null],["Bob Hopkins",8.7,6.2,0.7,null,null],["Chet Walker",16.22,7.91,1.85,null,null],["Connie Dierking",6.92,6.05,0.82,null,null],["Darrall Imhoff",9.2,9.7,2.7,null,null],["Dave Gambee",11.49,5.68,1.11,null,null],["Dick Barnett",15,3.22,2.8,null,null],["Dolph Schayes",17.12,9.49,2.97,null,null],["George Wilson",5.8,5.7,0.8,null,null],["George Yardley",20.2,7.9,1.7,null,null],["Gerry Ward",2.6,1.3,1.2,null,null],["Hal Greer",21.17,5.63,4.18,null,null],["Hubie White",3.4,1.8,0.5,null,null],["Joe Graboski",5.1,4.6,0.9,null,null],["Joe Roberts",6.17,5.17,0.58,null,null],["Johnny Green",4.83,4.18,0.6,null,null],["Larry Costello",12.24,3.35,4.66,null,null],["Larry Jones",5.7,2.5,1.7,null,null],["Lee Shaffer",16.8,6.34,1.18,null,null],["Len Chappell",8.8,5.78,0.69,null,null],["Luke Jackson",11.87,10.31,1.55,null,null],["Matt Guokas",4.24,1.64,1.76,null,null],["Paul Neumann",9.48,2.73,3.06,null,null],["Porter Meriwether",3.8,0.9,1.4,null,null],["Red Kerr",14.18,11.91,2.72,null,null],["Shaler Halimon",3.7,1.7,0.4,null,null],["Swede Halbrook",5.53,6.64,0.44,null,null],["Wali Jones",12.05,2.83,3.48,null,null],["Wilt Chamberlain",27.6,23.96,6.79,null,null]]],
    ["PHI","1970s",[["Al Henry",3.92,3.03,0.18,null,null],["Al Skinner",4.5,2,1.8,0.8,0],["Allan Bristow",5.55,3.28,1.53,0.39,0],["Archie Clark",20.58,4.41,5.22,null,null],["Bailey Howell",10.7,5.4,1.4,null,null],["Bill Bridges",13.31,13.32,2.47,null,null],["Billy Cunningham",22.43,11.4,5.15,1.12,0.42],["Bob Rule",16.48,7.65,1.73,null,null],["Bobby Jones",12.1,6.6,2.5,1.3,1.2],["Bud Ogden",3.48,1.4,0.66,null,null],["Caldwell Jones",6.87,8.25,1.39,0.43,2],["Clyde Lee",4.8,7.59,1.03,0.35,0.25],["Connie Dierking",5.8,4.3,1.1,null,null],["Connie Norman",5.6,1.51,0.89,0.38,0.1],["Dale Schlueter",5.4,4.5,1.3,null,null],["Darrall Imhoff",13.6,9.5,2.7,null,null],["Darryl Dawkins",9.19,6,0.97,0.33,1.32],["Dave Sorenson",5.9,3.6,0.6,null,null],["Dave Wohl",8.1,1.9,2.9,null,null],["Dennis Awtrey",5.76,5.27,1.11,null,null],["Don May",8.55,3.38,1.29,0.4,0.1],["Don Smith",5.2,0.6,0.9,0.4,0.1],["Doug Collins",18.49,3.32,3.36,1.29,0.28],["Eric Money",11.8,1.6,3.6,0.6,0.1],["Fred Carter",18.79,4.47,4.21,1.37,0.26],["Fred Foster",8.88,2.99,1.06,null,null],["Fred Hetzel",6.1,3.3,0.7,null,null],["Freddie Boyd",8.91,1.71,3.11,0.73,0.1],["Freddie Crawford",5,1.9,1.5,null,null],["George McGinnis",21.56,11.5,4.1,2.16,0.43],["George Wilson",5.3,4.7,0.8,null,null],["Hal Greer",15.84,3.98,4.31,null,null],["Harvey Catchings",3.05,4.98,0.67,0.32,1.62],["Henry Bibby",10.5,3.17,4.87,1.1,0.1],["Jeff Halliburton",9.5,2.6,2.2,null,null],["Jim Washington",12.87,9.3,1.27,null,null],["Joe Bryant",6.44,3.26,1.2,0.65,0.23],["John Block",17.9,9.2,2,null,null],["John Trapp",10.7,4.8,1.2,null,null],["John Tschogl",3.1,2.8,0.8,0.6,0.6],["Julius Erving",21.78,7.43,4.03,1.8,1.34],["Ken Durrett",3.3,2.3,0.4,0.1,0.1],["Kevin Loughery",12.99,2.73,3.13,null,null],["Larry Jones",10,2.6,3.2,1.2,0.3],["Leroy Ellis",9.71,8.97,1.76,0.77,0.81],["Luke Jackson",6.14,6.02,1.62,null,null],["Manny Leaks",11,8.3,1.2,null,null],["Matt Guokas",6.02,2.68,2.77,null,null],["Maurice Cheeks",8.4,3.1,5.3,2.1,0.1],["Mike Dunleavy",4.49,1.01,1.77,0.39,0.09],["Mike Price",5.1,2.1,1.2,null,null],["Ralph Simpson",5.5,0.9,1.6,0.7,0],["Rod Freeman",3,1.5,0.4,0.3,0],["Steve Mix",12.03,6.8,2.08,1.57,0.3],["Ted McClain",3.1,1.3,1.2,0.6,0.1],["Terry Furlow",2.6,1.2,0.6,0.2,0.1],["Toby Kimball",7.5,7.4,1,0.7,0.3],["Tom Van Arsdale",18.68,5.17,2.41,0.86,0],["Wali Jones",10.23,1.83,3.19,0.3,0],["World B. Free",13.57,2.55,3,0.81,0.3]]],
    ["PHI","1980s",[["Albert King",7.2,3,1.5,0.5,0.3],["Andrew Toney",15.94,2.15,4.2,0.78,0.21],["Ben Coleman",5.87,3.53,0.39,0.24,0.43],["Bob McAdoo",10.1,3.6,1.2,0.3,0.6],["Bob Thornton",2.92,2,0.3,0.14,0.1],["Bobby Jones",10.46,4.49,2.18,1.16,1.12],["Caldwell Jones",7.5,10.19,1.6,0.57,1.83],["Charles Barkley",22.14,11.98,3.55,1.61,1.23],["Chris Welp",3.57,2.66,0.41,0.32,0.59],["Clemon Johnson",4.93,4.41,0.54,0.36,0.81],["Cliff Robinson",16.82,6,1.91,1.42,0.5],["Clint Richardson",6.56,2.31,1.99,0.6,0.19],["Danny Vranes",2.25,2.3,0.55,0.55,0.5],["Darryl Dawkins",13.57,7.6,1.53,0.52,1.52],["David Wingate",7.95,1.72,2.04,0.88,0.25],["Derek Smith",7.8,2.4,1.9,0.7,0.4],["Doug Collins",13.43,2.55,2.98,0.75,0.22],["Earl Cureton",4.27,3.65,0.54,0.47,0.36],["Franklin Edwards",4.91,0.91,1.94,0.7,0.1],["George Johnson",4.8,3,0.7,0.6,0.3],["Gerald Henderson",7.48,1.21,2.71,0.81,0.05],["Greg Stokes",4.1,1.8,0.5,0.5,0.4],["Henry Bibby",9,2.5,3.7,0.8,0.1],["Hersey Hawkins",15.1,2.8,3,1.5,0.5],["Jim Spanarkel",5,1.4,1.3,0.3,0.2],["Julius Erving",22.03,6.41,3.8,1.8,1.63],["Kenny Green",3.92,1.6,0.35,0.1,0.1],["Leo Rautins",1.7,1.2,1,0.3,0.1],["Leon Wood",4.11,0.67,1.81,0.33,0],["Lionel Hollins",10.52,2.34,4.1,1.36,0.21],["Marc Iavaroni",4.92,3.93,1.06,0.44,0.62],["Mark McNamara",2.98,3,0.29,0.1,0.18],["Maurice Cheeks",12.63,2.96,7.49,2.28,0.33],["Mike Bantom",8.8,5.3,1.1,0.6,0.9],["Mike Gminski",17.09,9.8,1.74,0.67,1.48],["Moses Malone",23.93,13.42,1.38,0.95,1.53],["Ollie Johnson",4,1.16,0.64,0.5,0.1],["Paul Thompson",7.8,2.7,1,0.7,0.7],["Perry Moss",4.2,1.5,1.5,0.8,0.2],["Reggie Johnson",5.5,3.1,0.8,0.3,0.6],["Ron Anderson",16.2,5,1.7,0.9,0.3],["Roy Hinson",13.26,6.23,0.83,0.66,2.16],["Russ Schoene",5.1,3.3,0.7,0.3,0.2],["Sam Williams",5.27,3.75,0.62,0.78,1.14],["Scott Brooks",5.2,1.1,3.7,0.8,0],["Sedale Threatt",6.89,1.4,2.18,0.97,0.12],["Shelton Jones",5,2.3,0.8,0.4,0.3],["Steve Colter",5.99,1.5,2.59,0.81,0.08],["Steve Mix",9.9,3.43,1.54,0.73,0.2],["Terry Catledge",7.7,4.3,0.3,0.5,0.1],["Tim McCormick",11.69,7.23,1.33,0.44,0.69],["World B. Free",5.8,1,1.5,0.3,0.2]]],
    ["PHI","1990s",[["Aaron McKie",4.32,2.85,2.21,1.35,0.15],["Adrian Caldwell",2.7,4.1,0.3,0.3,0.3],["Allen Iverson",23.69,4.13,6.31,2.19,0.25],["Andre Turner",5.9,2.2,4.4,0.9,0],["Andrew Lang",5.3,6,1.1,0.6,1.9],["Anthony Parker",1.85,0.66,0.47,0.28,0.09],["Armen Gilliam",14.74,7.08,1.52,0.59,0.79],["B.J. Tyler",3.5,1.1,3.2,0.7,0],["Benoit Benjamin",3.36,3.05,0.2,0.21,0.21],["Bob Thornton",2.2,2.4,0.3,0.4,0.2],["Brian Oliver",3.36,1.04,1.01,0.44,0.1],["Brian Shaw",6.1,3.2,4.4,0.7,0.2],["Charles Barkley",25.21,10.94,4.06,1.78,0.57],["Charles Shackleford",5.56,5.2,0.56,0.42,0.62],["Clarence Weatherspoon",15.33,8.3,1.97,1.16,1.1],["Corey Gaines",3.24,1.15,2.95,0.56,0.06],["Dana Barros",16.97,2.85,6.36,1.55,0.05],["Dave Hoppen",1.3,0.85,0.1,0.05,0],["Derek Smith",8.9,2.3,1.5,0.5,0.3],["Derrick Alston",5.5,3.77,0.66,0.71,0.61],["Derrick Coleman",17.27,9.7,2.93,0.81,1.22],["Don MacLean",10.9,3.8,1,0.3,0.3],["Doug Overton",3.1,0.88,1.54,0.34,0],["Ed Pinckney",5.6,6.5,0.8,1.2,0.4],["Eddie Lee Wilkins",6.1,1.5,0.1,0.3,0],["Eric Leckner",5.1,4,1.2,0.3,0.5],["Eric Montross",3.4,4.6,0.4,0.4,0.6],["Eric Snow",6.27,2.51,4.91,1.7,0.05],["George Lynch",8.3,6.5,1.8,2,0.5],["Greg Graham",5.02,1.24,1.09,0.76,0.09],["Greg Grant",3.37,1.1,3.39,0.68,0.02],["Greg Sutton",6.3,1.2,2.1,0.6,0.1],["Harvey Grant",3.1,2.3,0.5,0.4,0.3],["Hersey Hawkins",19.96,3.8,3.47,1.85,0.42],["Jaren Jackson",3.3,2,0.9,0.4,0.2],["Jayson Williams",3.79,2.49,0.25,0.3,0.25],["Jeff Grayer",8.3,3.2,1.6,0.6,0.1],["Jeff Hornacek",18.1,4.18,6.5,1.74,0.26],["Jeff Malone",13.5,2.41,1.52,0.58,0],["Jerry Stackhouse",19.49,3.91,3.42,1.14,0.95],["Jim Jackson",13.7,4.7,4.6,0.9,0.1],["Joe Smith",10.3,4.4,0.9,0.6,0.4],["Johnny Dawkins",10.67,2.38,5.75,1.15,0.1],["Kenny Payne",3.52,1.16,0.4,0.25,0.17],["Kurt Nimphius",2.4,1.6,0.2,0.1,0.5],["LaSalle Thompson",1.9,4.5,0.6,0.4,0.5],["Lanard Copeland",3.2,0.4,0.4,0,0],["Larry Hughes",9.1,3.8,1.5,0.9,0.3],["Lucious Harris",5.4,1.3,0.9,0.8,0.1],["Manute Bol",1.84,3.58,0.26,0.21,2.71],["Mark Bradtke",1.6,1.9,0.2,0.1,0.1],["Mark Davis",6.31,3.28,1.41,0.91,0.35],["Mark Hendrickson",2.9,3.2,0.1,0.3,0.1],["Matt Geiger",13.5,7.2,1.2,0.8,0.8],["Michael Cage",1.8,3.9,0.5,0.6,0.5],["Mike Gminski",12.46,8.01,1.46,0.5,1.25],["Mitchell Wiggins",4.3,1.9,0.4,0.4,0],["Moses Malone",5.3,4.1,0.6,0.2,0.3],["Nazr Mohammed",1.6,1.4,0.1,0.2,0.2],["Orlando Woolridge",12.7,4,1.9,0.6,0.8],["Rex Walters",5.36,1.49,2.06,0.53,0.08],["Richard Dumas",6.2,2.5,1.1,1.1,0.2],["Rick Mahorn",8.98,7.11,1.28,0.76,0.95],["Rickey Green",10,1.7,5.2,0.7,0.1],["Ron Anderson",12.24,3.64,1.53,0.79,0.15],["Scott Brooks",4.4,0.9,2.9,0.7,0],["Scott Williams",5.33,5.37,0.66,0.65,0.53],["Sean Green",4.3,1,0.5,0.5,0.2],["Sean Higgins",8,2.1,1.3,0.5,0.3],["Sharone Wright",11.07,6.18,0.6,0.5,1.12],["Shawn Bradley",9.72,7.45,1.09,0.77,3.19],["Terry Cummings",5.3,3.4,0.5,0.5,0.1],["Theo Ratliff",11.2,7.67,0.65,0.79,3.27],["Tim Perry",7.32,4.33,1.14,0.55,0.9],["Tim Thomas",9.84,3.37,1.15,0.61,0.2],["Tony Massenburg",9.9,6.2,0.4,0.5,0.4],["Trevor Ruffin",12.8,2.2,4.4,0.7,0],["Tyrone Hill",8.5,7.3,0.9,0.8,0.4],["Vernon Maxwell",16.2,3.1,4.4,1.3,0.2],["Warren Kidd",3.6,3.4,0.3,0.3,0.3],["Willie Burton",15.3,3.1,1.8,0.6,0.4]]],
    ["PHI","2000s",[["Aaron McKie",8.58,3.56,3.2,1.23,0.21],["Alan Henderson",3.1,2.8,0.3,0.2,0.3],["Allen Iverson",29.93,3.85,6.08,2.39,0.16],["Amal McCaskill",1.9,2.3,0.3,0.2,0.3],["Andre Iguodala",15.6,5.68,4.36,1.8,0.46],["Andre Miller",15.86,4.29,6.85,1.3,0.14],["Billy Owens",5.9,4.2,1.3,0.6,0.3],["Bobby Jones",2.5,1.3,0.4,0.3,0],["Brian Skinner",5.05,4.28,0.2,0.5,0.6],["Bruce Bowen",1.4,0.9,0.4,0.2,0.1],["Calvin Booth",0.8,1.2,0.3,0.2,0.6],["Chris Webber",17.9,9.28,3.34,1.3,0.82],["Corie Blount",3.6,5.1,0.6,0.7,0.4],["Corliss Williamson",10.8,3.7,0.9,0.5,0.3],["Derrick Coleman",11.21,7.36,1.51,0.74,0.96],["Derrick McKey",2.9,3.1,1.1,1,0.1],["Dikembe Mutombo",11.55,11.19,0.95,0.38,2.42],["Donyell Marshall",3.8,1.6,0.6,0.2,0.2],["Efthimios Rentzias",1.5,0.7,0.2,0.2,0.1],["Elton Brand",13.8,8.8,1.3,0.6,1.6],["Eric Snow",10.58,3.43,7.01,1.52,0.1],["George Lynch",8.97,7.49,1.75,1.39,0.45],["Glenn Robinson",16.6,4.5,1.4,1,0.2],["Greg Buckner",4.8,2.49,1.09,0.75,0.16],["Jason Smith",4.5,3,0.3,0.3,0.7],["Joe Smith",9.2,6.7,0.9,0.6,0.4],["John Salmons",5.1,2.11,1.83,0.69,0.18],["Josh Davis",2.8,1.9,0.3,0.2,0.1],["Jumaine Jones",3.69,2.33,0.4,0.4,0.2],["Kareem Rush",2.2,0.6,0.6,0.2,0],["Keith Van Horn",15.9,7.1,1.3,0.9,0.4],["Kenny Thomas",12.02,8.67,1.56,1.02,0.34],["Kevin Ollie",2.7,1.12,1.64,0.4,0],["Kyle Korver",10.49,3.24,1.54,0.81,0.27],["Larry Hughes",10,3.2,1.5,1.1,0.2],["Lee Nailon",4.2,1.9,0.3,0.4,0.2],["Lou Amundson",1.29,1.57,0.04,0.1,0.37],["Lou Williams",9.03,1.65,2.45,0.76,0.13],["Marc Jackson",11.44,5.15,0.96,0.42,0.22],["Marreese Speights",7.7,3.7,0.4,0.3,0.7],["Matt Barnes",3,1.9,0.4,0.3,0.1],["Matt Geiger",8.15,5.15,0.51,0.35,0.27],["Matt Harpring",11.8,7.1,1.3,0.9,0.1],["Michael Bradley",1.62,2.27,0.4,0.1,0.19],["Monty Williams",4.4,2.1,1.2,0.6,0.2],["Nazr Mohammed",2.57,1.8,0.1,0.15,0.3],["Pepe Sánchez",0.8,0.6,1.5,0.4,0],["Raja Bell",3.25,1.42,0.94,0.29,0.09],["Reggie Evans",4.26,6.07,0.55,0.8,0.1],["Rodney Buford",5.3,1.6,0.4,0.4,0.1],["Rodney Carney",6.19,2,0.45,0.6,0.3],["Rodney Rogers",6,3.7,0.9,0.8,0.3],["Royal Ivey",3,1.1,0.6,0.5,0.1],["Samuel Dalembert",8.08,8.1,0.43,0.49,1.95],["Shavlik Randolph",2.5,2.49,0.3,0.31,0.31],["Speedy Claxton",7.2,2.4,3,1.4,0.1],["Steven Hunter",6.25,4.35,0.3,0.2,1.1],["Thaddeus Young",11.77,4.6,0.95,1.15,0.2],["Theo Ratliff",9.06,6.39,0.68,0.54,2.63],["Todd MacCulloch",4.74,3.19,0.28,0.24,0.57],["Toni Kukoč",9.76,3.84,2.9,0.82,0.18],["Tyrone Hill",9.84,8.54,0.65,0.68,0.39],["Vernon Maxwell",5,1.5,1.2,0.5,0],["Vonteego Cummings",3.3,0.9,1,0.3,0.1],["Willie Green",9.5,1.95,1.67,0.66,0.16],["Zendon Hamilton",3.64,3.13,0.29,0.22,0.2]]],
    ["PHI","2010s",[["Allen Iverson",13.9,3,4.1,0.7,0.1],["Amir Johnson",4.31,3.85,1.44,0.48,0.48],["Andre Iguodala",14.77,6.16,5.87,1.64,0.61],["Andrés Nocioni",5.32,2.8,0.68,0.27,0.27],["Arnett Moultrie",3.56,3.06,0.2,0.46,0.22],["Ben Simmons",16.34,8.45,7.95,1.55,0.85],["Boban Marjanović",8.2,5.1,1.5,0.2,0.5],["Brandon Davies",3.79,2.55,0.75,0.61,0.2],["Carl Landry",9.8,4.1,0.9,0.3,0.3],["Damien Wilkins",6.4,1.7,1.5,0.6,0.3],["Daniel Orton",3,2.8,0.7,0.3,0.7],["Dario Šarić",13.49,6.5,2.37,0.67,0.34],["Dorell Wright",9.2,3.8,1.9,0.8,0.4],["Elliot Williams",6,1.9,1.1,0.5,0],["Elton Brand",12.57,6.97,1.46,1.03,1.25],["Ersan İlyasova",13.59,6.14,1.77,0.63,0.33],["Evan Turner",11.48,5.45,3.19,0.77,0.2],["Furkan Aldemir",2.3,4.3,0.7,0.4,0.4],["Furkan Korkmaz",4.85,1.88,0.92,0.49,0.02],["Gerald Henderson",9.2,2.6,1.6,0.6,0.2],["Henry Sims",9,5.45,1.28,0.61,0.43],["Hollis Thompson",7.86,3.12,1.09,0.64,0.29],["Isaiah Canaan",11.36,2.34,2.09,0.7,0.18],["Ish Smith",13.8,3.83,6.7,1.3,0.33],["JaKarr Sampson",5.16,2.39,0.84,0.38,0.36],["Jahlil Okafor",14.55,5.9,1.19,0.39,1.1],["James Anderson",10.1,3.8,1.9,0.9,0.4],["Jarvis Varnado",4.3,2.7,0.6,0.4,1.3],["Jason Kapono",4.22,0.99,0.55,0.31,0.07],["Jason Richardson",9.99,3.69,1.68,1.02,0.39],["Jason Smith",3.4,2.4,0.6,0.4,0.5],["Jerami Grant",8.14,3.91,1.5,0.65,1.33],["Jerryd Bayless",8.12,2.24,1.61,0.56,0.19],["Jimmy Butler",18.2,5.3,4,1.8,0.5],["Jodie Meeks",9.08,2.23,0.95,0.7,0.06],["Joel Embiid",24.23,11.43,3.19,0.7,1.98],["Jonah Bolden",4.7,3.8,0.9,0.4,0.9],["Jrue Holiday",13.39,3.56,5.79,1.45,0.33],["Justin Anderson",7.09,3.02,0.97,0.44,0.24],["K.J. McDaniels",9.2,3.8,1.3,0.8,1.3],["Kendall Marshall",3.7,0.9,2.4,0.5,0.1],["Kwame Brown",1.9,3.4,0.4,0.3,0.5],["Landry Shamet",8.3,1.4,1.1,0.4,0.1],["Lavoy Allen",5.21,4.93,1,0.33,0.57],["Lorenzo Brown",2.5,1.1,1.6,0.5,0.1],["Lou Williams",14.17,2.41,3.68,0.88,0.23],["Luc Mbah a Moute",9.9,4.9,1.6,1.2,0.3],["Marco Belinelli",13.6,1.8,1.6,0.7,0.3],["Markelle Fultz",7.73,3.45,3.4,0.9,0.3],["Marreese Speights",6.97,3.69,0.55,0.3,0.4],["Michael Carter-Williams",16.07,6.2,6.71,1.75,0.53],["Mike Muscala",7.4,4.3,1.3,0.4,0.6],["Mike Scott",7.8,3.8,0.8,0.3,0.2],["Nerlens Noel",10.2,7.57,1.62,1.75,1.57],["Nick Young",10.6,2.2,1.4,0.6,0.2],["Nik Stauskas",8.71,2.56,2.09,0.6,0.34],["Nikola Vučević",5.5,4.8,0.6,0.4,0.7],["Richaun Holmes",7.41,4.21,0.96,0.51,0.81],["Robert Covington",12.87,5.63,1.59,1.66,0.78],["Rodney Carney",4.7,2,0.5,0.4,0.3],["Royal Ivey",3.04,1.07,0.63,0.4,0.1],["Samuel Dalembert",8.1,9.6,0.8,0.5,1.8],["Sergio Rodríguez",7.8,2.3,5.1,0.7,0.1],["Shake Milton",4.4,1.8,0.9,0.4,0.4],["Spencer Hawes",10,7.01,2.26,0.41,1.2],["T.J. McConnell",6.43,2.88,4.65,1.28,0.15],["Thaddeus Young",14.47,5.87,1.51,1.46,0.48],["Thomas Robinson",8.8,7.7,1.1,0.7,0.4],["Timothé Luwawu-Cabarrot",6.14,1.86,1.06,0.37,0.1],["Tobias Harris",18.2,7.9,2.9,0.4,0.5],["Tony Battie",2.18,2.56,0.42,0.1,0.32],["Tony Wroten",13.73,3.07,3.56,1.19,0.21],["Trevor Booker",4.7,3.7,0.8,0.5,0.3],["Willie Green",8.7,1.8,2.1,0.4,0.2],["Wilson Chandler",6.7,4.7,2,0.6,0.5]]],
    ["PHI","2020s",[["Dwight Howard",7,8.4,0.9,0.4,0.9],["Kyle Lowry",4.4,1.9,2.6,0.7,0.3],["P.J. Tucker",3.5,3.9,0.8,0.5,0.2],["Paul Millsap",3.5,3.5,0.9,0.3,0.4],["Anthony Tolliver",1.5,0.9,0.2,0.3,0.2],["Eric Gordon",6.2,0.8,1.1,0.7,0.2],["Nicolas Batum",5.3,4.1,2.1,0.8,0.6],["George Hill",8.7,2,2.4,0.8,0.2],["DeAndre Jordan",4.3,5.5,0.4,0.3,0.7],["James Harden",21.5,6.9,10.5,1.2,0.6],["Danny Green",5.1,2.4,1.1,0.9,0.5],["Paul George",16.8,5.3,4,1.8,0.5],["Tobias Harris",17.1,6.5,3.1,0.8,0.7],["Reggie Jackson",4.4,1.4,1.5,0.5,0.1],["Andre Drummond",6.8,8.1,1.1,0.8,0.7],["Mike Scott",4.2,2.4,0.8,0.5,0.3],["Dewayne Dedmon",5.2,3.5,0.7,0.2,0.5],["Robert Covington",4.4,3.3,0.8,1.3,0.6],["Seth Curry",12.5,2.4,2.7,0.8,0.1],["Joel Embiid",29.6,9.9,4.2,0.9,1.4],["Montrezl Harrell",5.6,2.8,0.6,0.3,0.4],["Willie Cauley-Stein",1.7,2,0.5,0.3,0.2],["Kelly Oubre Jr.",14.9,5.4,1.6,1.3,0.6],["Cameron Payne",7.4,1.8,2.6,0.8,0.2],["Ben Simmons",14.3,7.2,6.9,1.6,0.6],["Buddy Hield",12.1,3.2,2.8,0.8,0.5],["Georges Niang",8.7,2.5,1.1,0.4,0.2],["Furkan Korkmaz",5.8,1.7,1.2,0.5,0.1],["Guerschon Yabusele",11,5.6,2.1,0.8,0.3],["Danuel House Jr.",4.5,1.7,0.8,0.3,0.2],["Terrance Ferguson",0.2,0.1,0.2,0.1,0],["Mo Bamba",4.4,4.2,0.7,0.4,1.1],["De'Anthony Melton",10.6,3.9,2.8,1.6,0.5],["Shake Milton",9.9,2.5,2.9,0.5,0.3],["Lonnie Walker IV",12.4,3.2,2.5,0.5,0.3],["Oshae Brissett",8.7,3.7,0.7,0.7,0.5],["Gary Clark",3.1,2.9,0.8,0.3,0.2],["Myles Powell",1.2,0.5,0.3,0.1,0],["Charles Bassey",3,2.7,0.3,0.2,0.7],["Quentin Grimes",14,4,3.1,0.9,0.3],["Louis King",20,4,2,1,0],["Jalen McDaniels",9.4,4.3,1.6,1,0.4],["Matisse Thybulle",4.8,2.1,1.1,1.6,1.1],["Charlie Brown Jr.",1.4,1.5,0.3,0.5,0.2],["Rayjon Tucker",2.4,0.8,0.4,0.1,0],["Vincent Poirier",0.8,1.4,0.2,0,0.3],["Dakota Mathias",6,0.9,1.6,0.1,0.4],["Tyrese Maxey",21.1,3.1,4.8,1.1,0.4],["Paul Reed",4.5,3.6,0.7,0.7,0.7],["Filip Petrusev",1,0.3,0,0,0],["Isaiah Joe",3.7,0.9,0.6,0.3,0.1],["Jared Butler",9,1.8,3.7,0.7,0.2],["Mason Jones",5.3,1.7,1.3,0.2,0],["KJ Martin",3.7,2.2,0.9,0.4,0.2],["Trevelin Queen",3,2.4,0.9,0.3,0.7],["Jeff Dowtin Jr.",5.7,1.6,2.1,0.6,0.2],["Jaden Springer",1.8,0.9,0.2,0.2,0.6],["Marcus Bagley",6.7,7,1,0.9,1.2],["Aaron Henry",0.3,0.2,0,0,0.3],["Trendon Watford",6.5,3.3,2.5,0.3,0.4],["Isaiah Mobley",6,4,5,1,1],["Javonte Smart",0,0,0,0,0],["Mac McClung",12.5,5,4.5,0,0],["MarJon Beauchamp",6.8,2.3,1.1,0.6,0.3],["Michael Foster Jr.",0,0,0,0,0],["Phillip Wheeler",1.6,1.6,0.4,0.2,0.4],["Jabari Walker",4.3,3,0.5,0.4,0.2],["Terquavion Smith",3.3,0.3,0.8,0.5,0],["Dalen Terry",3.7,1.8,1.4,0.6,0.3],["Tyrese Martin",6.3,2.5,1.7,0.5,0.1],["Dominick Barlow",7.7,4.8,1.2,0.9,0.7],["Jalen Hood-Schifino",7.1,1.8,2.5,0.3,0.5],["Adem Bona",5.3,4.2,0.5,0.4,1.2],["Ricky Council IV",6.3,2.1,0.9,0.3,0.1],["Johni Broome",0.9,1.5,0.4,0.3,0.2],["Alex Reese",5.1,3.1,0.3,0.7,0.7],["Jared McCain",15.3,2.4,2.6,0.7,0],["Hunter Sallis",1,0.1,0.6,0,0.1],["Justin Edwards",8.1,2.5,1.5,0.9,0.3],["VJ Edgecombe",16,5.6,4.2,1.4,0.5]]],
    ["PHX","1960s",[["Bob Warlick",8,2.4,2.1,null,null],["Dave Lattin",6,4.8,0.7,null,null],["Dick Snyder",12.1,4,2.6,null,null],["Dick Van Arsdale",21,6.9,4.8,null,null],["Gail Goodrich",23.8,5.4,6.4,null,null],["Gary Gregor",11.1,8.9,1.2,null,null],["George Wilson",11.6,12.3,1.9,null,null],["Jim Fox",13.8,13.3,2.8,null,null],["McCoy McLemore",11.8,5.4,1.6,null,null],["Neil Johnson",5.8,5,1.7,null,null],["Stan McKenzie",9.3,3.1,1.5,null,null]]],
    ["PHX","1970s",[["Alvan Adams",17.63,8.89,4.54,1.36,1.11],["Alvin Scott",6.4,4.4,1.35,0.8,0.65],["Art Harris",7.27,1.68,2.39,null,null],["Bayard Forrest",4.09,4.06,2.11,0.4,0.5],["Bob Christian",4.8,4.2,1.2,0.2,0.4],["Butch Feher",5.2,1.5,0.8,0.2,0.1],["Charlie Scott",24.81,4.15,5.29,1.73,0.34],["Clem Haskins",13.82,3.09,3.56,1,0.2],["Connie Hawkins",20.48,9,4.31,1,0.4],["Corky Calhoun",6.75,4.52,1.26,0.84,0.37],["Curtis Perry",11.48,9.5,2.1,1.17,0.8],["Dale Schlueter",1.8,2.1,1,0.2,0.2],["Dennis Awtrey",6.07,5.35,2.72,0.38,0.4],["Dick Van Arsdale",17.16,3.14,3.33,0.92,0.17],["Don Buse",8.1,2.8,4.55,2.1,0.2],["Earl Williams",4.7,5.8,1.2,0.4,0.4],["Fred Saunders",5.61,3.4,1.12,0.54,0.18],["Fred Taylor",4.67,1.54,0.82,null,null],["Gail Goodrich",20,4.2,7.5,null,null],["Gar Heard",8.5,8.03,1.56,1.26,1.14],["Gary Melchionni",7.85,2.45,2.2,0.65,0.15],["Greg Griffin",4,2.9,0.7,0.4,0],["Greg Howard",3.9,2.7,0.6,null,null],["Greg Jackson",4,1.5,2.1,0.5,0.2],["Gus Johnson",7.8,6.5,1.5,null,null],["Ira Terrell",8.5,5,1.3,0.5,0.6],["Jeff Webb",2.5,0.6,0.6,null,null],["Jerry Chambers",8.3,2.8,0.7,null,null],["Jim Fox",12.9,7,1.1,null,null],["Jim Owens",3.03,0.85,1.11,0.37,0],["Joe Thomas",1.4,1.1,0.4,null,null],["Joel Kramer",5.9,4.1,1.1,0.5,0.3],["John Shumate",11.3,5.6,1.4,1,0.4],["John Wetzel",3.03,1.63,1.18,0.2,0.1],["Keith Erickson",11.02,4.76,2.79,0.95,0.18],["Lamar Green",5.25,6.36,0.72,0.4,0.5],["Marty Byrnes",6.8,2.3,1.4,0.3,0],["Mel Counts",8.17,4.89,1.51,null,null],["Mike Bantom",10.99,6.6,1.93,0.73,0.59],["Mike Bratz",6.37,1.6,1.89,0.65,0.1],["Mo Layton",8.2,1.7,2.65,null,null],["Nate Hawthorne",6.02,2.29,0.68,0.48,0.28],["Neal Walk",14.74,8.89,2.36,0.9,0.7],["Neil Johnson",1.7,1.7,0.4,null,null],["Otto Moore",7.6,6.7,1.1,null,null],["Pat Riley",4.6,0.8,1,0.4,0.1],["Paul Silas",14.07,12.04,3.34,null,null],["Paul Westphal",22.74,2.4,5.77,1.85,0.38],["Phil Lumpkin",2.1,0.7,1.4,0.4,0],["Ricky Sobers",11.41,3.15,2.9,1.3,0.15],["Ron Lee",10.91,3.19,3.38,2.15,0.26],["Stan McKenzie",3.8,1.6,0.9,null,null],["Ted McClain",4.6,1.9,1.7,0.5,0],["Tom Van Arsdale",5.8,2.4,0.9,0.3,0],["Truck Robinson",16,8.7,1.5,0.7,0.5],["Walt Wesley",3.2,2.5,0.5,null,null],["Walter Davis",23.9,5.36,3.84,1.65,0.25]]],
    ["PHX","1980s",[["Alvan Adams",12.56,6.24,3.86,1.25,0.68],["Alvin Scott",4.42,2.75,1.34,0.58,0.6],["Andrew Lang",2.6,2.4,0.1,0.3,0.8],["Armen Gilliam",15.43,7.56,0.96,0.87,0.44],["Bernard Thompson",6.73,2.04,1.68,0.68,0.14],["Charles Jones",7.09,4.89,1.46,0.64,0.73],["Charles Pittman",4.56,3.07,0.86,0.31,0.3],["Craig Dykema",1.3,0.4,0.5,0.1,0],["Craig Hodges",8.22,1.13,1.57,0.55,0.07],["Dan Majerle",8.6,3.9,2.4,1.2,0.3],["David Thirdkill",4,1.5,0.7,0.4,0.1],["Dennis Johnson",17.54,4.7,4.43,1.43,0.67],["Don Buse",7.7,2.9,4,1.6,0.1],["Dudley Bradley",5.1,1.4,1.3,1.2,0.2],["Ed Nealy",0.6,1.8,0.3,0.1,0],["Ed Pinckney",9.5,5.6,1.3,1,0.6],["Eddie Johnson",19.56,4.4,2.4,0.6,0.1],["Gar Heard",5,4.6,1.2,1,0.6],["Georgi Glouchkov",4.9,3.3,0.7,0.5,0.5],["Grant Gondrezick",5.5,1.7,1.3,0.4,0.1],["James Bailey",4.4,3.2,0.6,0.3,0.4],["James Edwards",14.73,5.57,2,0.35,0.57],["Jay Humphries",10.77,2.87,6.34,1.39,0.1],["Jeff Cook",5.46,4.18,1.52,0.56,0.39],["Jeff Hornacek",9.4,2.97,5.7,1.3,0.1],["Joel Kramer",3.14,2.33,1.03,0.38,0.16],["Johnny High",5.11,2.24,1.95,1.19,0.31],["Kenny Gattison",5.08,3.42,0.49,0.29,0.39],["Kevin Johnson",18.4,4.23,11.3,1.65,0.3],["Kyle Macy",10.65,2.36,3.96,1.24,0.08],["Larry Nance",17.32,7.81,2.56,1.04,1.92],["Mark West",8.4,7.12,0.58,0.5,2.3],["Maurice Lucas",15.38,9.69,2.62,0.67,0.48],["Michael Holton",8.12,1.75,2.65,0.78,0.09],["Mike Bratz",8.5,2,2.7,1.1,0.1],["Mike Niles",2.6,1.3,0.3,0.2,0],["Mike Sanders",8.91,2.95,1.39,0.73,0.28],["Nick Vanos",3.22,3.57,0.91,0.28,0.42],["Paul Westphal",15.67,1.63,4.01,1.17,0.27],["Rafael Addison",5.8,1.7,0.7,0.4,0.1],["Rich Kelley",7.24,5.67,3.38,0.94,0.83],["Rick Robey",4.7,3.16,1.19,0.35,0.15],["Rod Foster",7.54,1.24,2.35,0.69,0.04],["Rory White",5.61,1.9,0.53,0.3,0.03],["Steve Kerr",2.1,0.7,0.9,0.3,0],["T.R. Dunn",1,1.8,0.7,0.4,0],["Tim Perry",4.1,2.1,0.3,0.3,0.5],["Tom Chambers",25.7,8.4,2.9,1.1,0.7],["Truck Robinson",18.38,9.56,2.19,0.7,0.54],["Tyrone Corbin",8.06,4.95,1.64,1.07,0.17],["Walter Davis",19.54,2.67,4.51,1.29,0.14],["William Bedford",6.7,4.9,1.1,0.4,0.7],["Winston Crite",2.81,2.09,0.47,0.19,0.28]]],
    ["PHX","1990s",[["A.C. Green",10.6,7.77,1.29,0.7,0.36],["Andrew Lang",5.47,5.13,0.4,0.41,2.12],["Antonio McDyess",15.1,7.6,1.3,1.2,1.7],["Ben Davis",1.5,1.4,0,0.2,0.1],["Cedric Ceballos",11.82,4.48,1.02,0.6,0.28],["Charles Barkley",23.43,11.55,4.39,1.6,0.78],["Chris Carr",4,1.7,0.7,0.2,0.1],["Chris Morris",4.2,2.8,0.5,0.4,0.3],["Clifford Robinson",15.05,4.87,2.29,1.32,1.14],["Dan Majerle",15.25,5.14,3.35,1.49,0.47],["Danny Ainge",9.55,2.05,2.92,0.77,0.1],["Danny Manning",13.42,5.43,2.33,0.98,0.89],["Danny Schayes",4.4,3,1.3,0.3,0.5],["Dennis Scott",6.2,1.7,0.8,0.3,0.2],["Duane Cooper",2.1,0.4,1.2,0.1,0],["Ed Nealy",2.64,2.41,0.7,0.35,0.05],["Eddie Johnson",16.25,3.67,1.59,0.52,0.18],["Elliot Perry",8.41,1.7,4.6,1.42,0.04],["Frank Johnson",4.44,1.36,2.26,0.7,0.05],["George McCloud",7.94,3.46,1.43,0.9,0.24],["Gerald Brown",2.4,0.7,0.9,0.2,0],["Greg Grant",3.1,0.9,2.5,0.5,0],["Hot Rod Williams",6.23,6.21,1.06,0.73,1.19],["Jason Kidd",13.21,6.1,9.6,2.17,0.35],["Jeff Hornacek",18.24,4.56,5.07,1.7,0.27],["Jerrod Mustaf",3.88,2.44,0.54,0.32,0.27],["Joe Courtney",3.1,0.8,0.3,0.1,0.2],["Joe Kleine",3.38,2.85,0.58,0.23,0.19],["Kenny Battle",4.51,2.36,0.66,0.73,0.24],["Kevin Johnson",18.83,3.24,9.24,1.49,0.22],["Kurt Rambis",4.15,5.13,1.33,0.71,0.36],["Loren Meyer",5.4,2.7,0.3,0.1,0.3],["Luc Longley",8.7,5.7,1.2,0.6,0.5],["Mark Bryant",6.08,4.13,0.85,0.5,0.16],["Mark West",6.86,5.9,0.42,0.32,1.56],["Marko Milič",2.47,0.73,0.35,0.3,0.02],["Michael Finley",14.5,4.55,3.25,0.93,0.33],["Mike Morrison",2,0.6,0.3,0.1,0],["Negele Knight",5.67,1.13,2.84,0.41,0.11],["Oliver Miller",7.59,6,2.87,0.98,2.08],["Pat Garrity",5.6,1.9,0.5,0.2,0.1],["Rex Chapman",14.26,2.66,2.9,0.9,0.16],["Richard Dumas",13.35,3.96,1.11,1.54,0.63],["Robert Horry",6.9,3.7,1.7,0.9,0.8],["Sam Cassell",14.8,2.3,4.5,1,0.3],["Steve Burtt",6,1.1,1.9,0.5,0.1],["Steve Nash",6.43,1.59,2.8,0.57,0.05],["Tim Kempton",1.9,1.3,0.6,0.1,0.1],["Tim Perry",7.68,4.44,0.98,0.51,1],["Toby Bailey",2.9,2,0.5,0.3,0.1],["Tom Chambers",19.17,6.01,2.11,0.86,0.53],["Tom Gugliotta",17,8.9,2.8,1.4,0.5],["Tony Smith",5.6,1.6,2.5,0.6,0.1],["Trevor Ruffin",4.8,0.5,1,0.3,0],["Wayman Tisdale",9.22,3.22,0.68,0.27,0.47],["Wesley Person",12.22,3.41,1.5,0.8,0.3],["Xavier McDaniel",15.8,7.2,2.3,0.8,0.6]]],
    ["PHX","2000s",[["Alando Tucker",4.45,1.05,0.33,0.17,0.03],["Alton Ford",2.67,1.74,0.1,0.08,0.08],["Amar'e Stoudemire",21.07,8.94,1.37,0.93,1.47],["Anfernee Hardaway",12.39,4.54,4.23,1.33,0.42],["Antonio McDyess",5.8,5.8,0.7,1,0.5],["Bo Outlaw",3.89,3.95,1.29,0.59,0.85],["Boris Diaw",10.42,5.17,4.72,0.6,0.65],["Brian Grant",2.9,2.7,0.3,0.2,0.1],["Brian Skinner",3.3,3.6,0.2,0.3,1.2],["Casey Jacobsen",5.51,1.88,1.1,0.5,0.08],["Chris Dudley",1.4,3.5,0.3,0.3,0.5],["Clifford Robinson",17.44,4.3,2.85,1.1,0.9],["Corie Blount",2.36,2.91,0.3,0.4,0.2],["D.J. Strawberry",2.2,0.8,0.9,0.4,0.2],["Dan Langhi",3.1,1.5,0.4,0.3,0.1],["Dan Majerle",4.6,2.7,1.4,0.7,0.2],["Daniel Santiago",3.08,1.92,0.23,0.28,0.39],["Donnell Harvey",3.9,2.6,0.4,0.4,0.4],["Eddie House",9.8,1.6,1.8,0.5,0.1],["Elliot Perry",3.2,1,1.7,0.4,0],["Eric Piatkowski",2.44,0.8,0.52,0,0.1],["Goran Dragić",4.5,1.9,2,0.5,0.1],["Gordan Giriček",8.8,2.3,1.6,0.4,0.1],["Grant Hill",12.51,4.95,2.58,1.01,0.75],["Howard Eisley",7.1,1.9,3.4,0.8,0.1],["Jahidi White",4.3,4.3,0.1,0.4,0.8],["Jake Tsakalidis",5.78,4.69,0.32,0.24,0.89],["Jake Voskuhl",4.64,3.99,0.58,0.33,0.38],["Jalen Rose",3.7,0.8,0.6,0.2,0.1],["James Jones",7.84,2.85,0.7,0.45,0.65],["Jared Dudley",5.5,3,0.8,0.8,0.1],["Jason Kidd",15.69,6.77,9.94,2.11,0.35],["Jason Richardson",16.4,4.5,1.9,1.1,0.4],["Jim Jackson",6.74,3.3,1.88,0.34,0.14],["Joe Johnson",14.01,4.31,3.51,0.96,0.28],["John Wallace",5,1.8,0.6,0.2,0.2],["Kurt Thomas",6.37,6.63,0.71,0.4,0.66],["Leandro Barbosa",12.94,2.45,2.72,1,0.14],["Lou Amundson",4.2,3.6,0.4,0.4,0.9],["Luc Longley",6.3,4.5,1.1,0.3,0.6],["Maciej Lampe",3.82,2.06,0.27,0.1,0.1],["Marcus Banks",5,0.8,1.2,0.43,0.17],["Mario Elie",4.4,2.3,1.9,0.9,0.2],["Mark West",0.7,1.4,0.1,0.1,0.2],["Matt Barnes",10.2,5.5,2.8,0.7,0.3],["Milt Palacio",2.8,0.8,1,0.3,0],["Oliver Miller",6.3,5.1,1.3,0.8,1.6],["Pat Burke",3.12,1.81,0.33,0.1,0.23],["Paul McPherson",3.4,1.5,0.5,0.4,0.1],["Quentin Richardson",14.9,6.1,2,1.2,0.3],["Raja Bell",13.43,3.32,2.34,0.75,0.31],["Randy Brown",1.3,0.8,1.1,0.5,0.1],["Randy Livingston",4.8,1.6,2.2,0.6,0.2],["Rex Chapman",6.6,1.5,1.2,0.4,0],["Robin Lopez",3.2,2,0.1,0.2,0.7],["Rodney Rogers",12.91,4.91,1.97,1.11,0.53],["Scott Williams",4.62,3.12,0.32,0.49,0.32],["Sean Marks",2.95,1.78,0.17,0.17,0.47],["Shaquille O'Neal",16.47,9,1.7,0.65,1.35],["Shawn Marion",18.38,10.01,2.02,1.89,1.36],["Stephon Marbury",21.25,3.23,8.13,1.24,0.18],["Steve Nash",17.12,3.51,10.88,0.8,0.12],["Steven Hunter",4.6,3,0.2,0.1,1.3],["Tim Thomas",11,4.9,0.7,0.6,0.2],["Toby Bailey",3.5,1.6,0.7,0.3,0.1],["Todd Day",6.8,2.2,1.1,0.8,0.4],["Tom Gugliotta",7.5,5,1.47,0.92,0.45],["Tony Delk",11.73,3.13,2,0.87,0.17],["Vinny Del Negro",4.69,1.33,1.76,0.57,0.09],["Walter McCarty",3.5,2.2,0.4,0.4,0.2],["Žarko Čabarkapa",4.04,1.94,0.75,0.19,0.28]]],
    ["PHX","2010s",[["Aaron Brooks",9.6,1.1,4.2,0.5,0],["Alan Williams",6.4,5.67,0.59,0.6,0.63],["Alex Len",7.23,6.49,0.78,0.43,1.03],["Amar'e Stoudemire",23.1,8.9,1,0.6,1],["Anthony Tolliver",3.3,1.8,0.4,0.2,0],["Archie Goodwin",6.2,2.03,1.24,0.44,0.2],["Brandan Wright",7,4.9,0.6,0.8,1.2],["Brandon Knight",15.05,2.95,3.8,0.81,0.23],["Channing Frye",11.41,5.73,1.3,0.7,0.94],["Danuel House Jr.",6.6,3.3,1.1,0.3,0.3],["Davon Reed",3,1.9,0.6,0.5,0.1],["De'Anthony Melton",5,2.7,3.2,1.4,0.5],["Deandre Ayton",16.3,10.3,1.8,0.9,0.9],["Derrick Jones Jr.",4.7,2.22,0.42,0.37,0.45],["Devin Booker",21.4,3.47,4.23,0.82,0.28],["Dionte Christmas",2.3,1.2,0.3,0.1,0.1],["Dragan Bender",5.32,3.79,1.22,0.3,0.55],["Earl Barron",2.43,2.44,0.3,0.39,0.19],["Earl Clark",2.78,1.3,0.4,0.1,0.3],["Elie Okobo",5.7,1.8,2.4,0.6,0.1],["Eric Bledsoe",18.8,4.78,6,1.59,0.51],["Gerald Green",13.95,2.97,1.36,0.76,0.36],["Goran Dragić",13.53,2.77,4.87,1.11,0.21],["Grant Hill",11.77,4.54,2.39,0.76,0.45],["Greg Monroe",11.3,8,2.5,0.8,0.3],["Hakim Warrick",7.79,3.37,0.9,0.34,0.1],["Hedo Türkoğlu",9.5,4,2.3,0.7,0.6],["Isaiah Canaan",8.3,2.45,3.65,0.7,0.05],["Isaiah Thomas",15.2,2.4,3.7,1,0.1],["Ish Smith",3.7,1.8,2.6,0.7,0.2],["Jamal Crawford",7.9,1.3,3.6,0.5,0.2],["Jared Dudley",9.09,3.48,1.75,0.87,0.21],["Jarron Collins",1,1.8,0.2,0.1,0.1],["Jason Richardson",16.57,4.93,1.7,0.87,0.33],["Jermaine O'Neal",8.3,5.3,0.8,0.3,1.4],["John Jenkins",4.51,1.4,1.06,0.17,0],["Jon Leuer",8.5,5.6,1.1,0.6,0.4],["Josh Childress",4.19,2.86,0.88,0.52,0.32],["Josh Jackson",12.29,4.5,1.91,0.95,0.6],["Kelly Oubre Jr.",16.9,4.9,1.6,1.4,1],["Kendall Marshall",3,0.9,3,0.5,0.1],["Leandro Barbosa",7.56,1.65,1.36,0.48,0.18],["Lou Amundson",4.7,4.4,0.4,0.3,0.9],["Luis Scola",12.8,6.6,2.2,0.8,0.4],["Marcin Gortat",13.23,9.29,1.03,0.64,1.47],["Marcus Morris",9.51,4.12,1.27,0.84,0.2],["Markieff Morris",11.42,5.38,1.72,0.91,0.63],["Marquese Chriss",8.5,4.81,0.93,0.75,0.95],["Michael Beasley",10.1,3.8,1.5,0.4,0.5],["Michael Redd",8.2,1.5,0.6,0.3,0],["Mickaël Piétrus",7.4,2,0.6,0.5,0.5],["Mikal Bridges",8.3,3.2,2.1,1.6,0.5],["Mike James",10.4,2.8,3.8,0.8,0.2],["Miles Plumlee",6.57,6.71,0.5,0.6,1.06],["Mirza Teletović",12.2,3.8,1.1,0.4,0.3],["P.J. Tucker",8.04,5.9,1.66,1.27,0.24],["Richaun Holmes",8.2,4.7,0.9,0.6,1.1],["Robin Lopez",6.61,3.71,0.17,0.27,0.85],["Ronnie Price",4.22,1.5,2.1,1.05,0.16],["Sebastian Telfair",6.06,1.5,2.39,0.66,0.2],["Shannon Brown",10.75,2.6,1.5,0.85,0.3],["Shaquille Harrison",6.6,2.7,2.4,1.1,0.3],["Shavlik Randolph",1.24,1.69,0.15,0.25,0.1],["Sonny Weems",2.5,1.1,1.3,0.3,0],["Steve Nash",14.74,3.28,11.05,0.56,0.1],["T.J. Warren",14.4,4.1,1.1,0.97,0.5],["Trevor Ariza",9.9,5.6,3.3,1.5,0.3],["Troy Daniels",7.84,1.52,0.56,0.38,0.1],["Tyler Ulis",7.57,1.71,4.08,0.91,0.1],["Tyson Chandler",7.2,9.47,0.94,0.49,0.59],["Viacheslav Kravtsov",1,0.9,0.1,0,0.1],["Vince Carter",13.5,3.6,1.6,0.9,0.3],["Wesley Johnson",8,2.5,0.7,0.4,0.4]]],
    ["PHX","2020s",[["Chris Paul",15,4.4,9.5,1.6,0.3],["Kevin Durant",27.6,6.4,4.7,0.8,1.3],["Thaddeus Young",4.2,3.1,1.7,0.7,0.2],["Eric Gordon",11,1.8,2,1,0.4],["JaVale McGee",9.2,6.7,0.6,0.3,1.1],["Bismack Biyombo",5,4.4,0.8,0.3,1],["E'Twaun Moore",4.9,1.7,1.5,0.6,0.2],["Isaiah Thomas",1.3,0,0.5,0,0],["Bradley Beal",17.6,3.9,4.3,1.1,0.5],["Terrence Ross",8.3,2.4,1.5,0.6,0.2],["Jae Crowder",9.8,5,2,1.1,0.5],["Mason Plumlee",4.5,6.1,1.8,0.4,0.6],["Elfrid Payton",3,1.8,2,0.5,0.1],["T.J. Warren",7.5,2.9,1,0.5,0.3],["Dario Saric",8.7,3.8,1.3,0.6,0.1],["Jusuf Nurkić",10.9,11,4,1.1,1.1],["Vasilije Micic",6.6,2.2,3.1,0.4,0],["Langston Galloway",4.8,1.1,0.7,0.2,0],["Tyus Jones",10.2,2.4,5.3,0.9,0.1],["Frank Kaminsky",8.6,4.3,1.5,0.6,0.6],["Devin Booker",26.5,4.4,5.8,0.9,0.3],["Cameron Payne",9.8,2.5,4.3,0.7,0.3],["Royce O'Neale",8.9,4.8,2.6,0.9,0.5],["Damion Lee",5.8,1.9,0.9,0.3,0.1],["Abdel Nader",4.5,2.2,0.7,0.5,0.3],["Paris Bass",3,2,0,0.5,0],["Justin Jackson",2.1,1,0.3,0,0],["Frank Jackson",0,2,1,0,0],["Dillon Brooks",20.2,3.6,1.8,1,0.2],["Monte Morris",5.2,1.5,1.6,0.4,0.1],["Torrey Craig",6.5,4.4,1.2,0.6,0.6],["Nigel Hayes-Davis",1.3,1.2,0.3,0.3,0.1],["Grayson Allen",13.5,3.3,3,1,0.4],["Udoka Azubuike",2.2,2,0.2,0.1,0.4],["Mikal Bridges",13.8,4.2,2.2,1.1,0.7],["Jevon Carter",4.1,1.5,1.2,0.5,0.2],["Aaron Holiday",6.3,1.9,2.4,0.7,0.1],["Chandler Hutchison",0.7,0.8,0.3,0,0],["Cody Martin",6.8,4.2,2,1.1,0.6],["Josh Okogie",5.9,3,1.3,0.8,0.5],["Landry Shamet",8.5,1.8,1.9,0.6,0.1],["Deandre Ayton",16.5,10.2,1.5,0.6,0.9],["Jock Landale",6.6,4.1,1,0.2,0.4],["Emanuel Terry",0,5,0.7,0.3,0],["Drew Eubanks",5.1,4.3,0.8,0.4,0.8],["Haywood Highsmith",5.4,1.9,1,0.6,0],["Amir Coffey",3.2,1.2,0.6,0.2,0.1],["Bol Bol",6,3,0.5,0.2,0.6],["Nassir Little",3.4,1.7,0.5,0.2,0.2],["Darius Bazley",5.2,3.2,0.9,0.5,0.8],["Cameron Johnson",11.1,3.7,1.4,0.8,0.2],["Theo Maledon",3.5,1.4,1.6,0.4,0],["Jalen Smith",2,1.4,0.1,0,0.1],["Nick Richards",9.3,8.2,0.9,0.2,1],["Jalen Green",17.8,3.6,2.8,1.1,0.3],["Ty-Shon Alexander",0.6,0.7,0.4,0,0.1],["Saben Lee",4.5,1.6,2,0.6,0.1],["Isaiah Livers",1.8,1.7,0.6,0.4,0.2],["MJ Walker",0,0.5,0.5,1,0],["Ish Wainright",2.9,1.6,0.4,0.5,0.2],["Jordan Goodwin",8.7,4.9,2.2,1.5,0.2],["Gabriel Lundberg",3.3,1.8,2.8,0.8,0],["TyTy Washington Jr.",2.2,0.8,1,0.2,0],["Mark Williams",11.7,8,1,0.9,0.9],["Jamaree Bouyea",5.7,1.8,1.8,0.6,0.3],["Collin Gillespie",9.3,3.2,3.5,0.9,0.2],["David Roddy",6.5,3.2,1.2,0.4,0.2],["Jalen Bridges",1.1,0.5,0,0,0],["Oso Ighodaro",5.3,4.3,1.8,0.7,0.6],["Ryan Dunn",6.3,3.9,1.1,0.8,0.5],["Rasheer Fleming",4.3,2.3,0.3,0.4,0.4],["Khaman Maluach",3,2.9,0.1,0.1,0.7],["Koby Brea",3.8,0.7,0.8,0.1,0],["CJ Huntley",3,1.3,0.5,0.3,0]]],
    ["POR","1970s",[["Barry Clemens",4.36,1.83,0.88,0.78,0.04],["Bernie Fryer",7,2,3.5,1.2,0.1],["Bill Walton",17.1,13.52,4.42,0.97,2.53],["Bob Gross",10.18,4.77,2.98,1.3,0.71],["Charlie Davis",8.38,1.58,2.39,0.3,0],["Charlie Yelverton",7.9,2.9,1.2,null,null],["Clemon Johnson",3.2,3.1,1.1,0.3,0.5],["Corky Calhoun",4.41,2.42,0.82,0.41,0.15],["Dale Schlueter",9.52,8.84,2.89,0.3,0.2],["Dan Anderson",3.68,0.97,1.74,0.4,0],["Darrall Imhoff",2.6,2.7,1.3,null,null],["Dave Twardzik",9.84,2.14,3.15,1.47,0.13],["Dave Wohl",5.4,0.9,3.1,null,null],["Ed Manning",7.1,5.2,1.4,null,null],["Gary Gregor",10.58,7.34,2.13,null,null],["Geoff Petrie",21.82,2.84,4.61,1.1,0.17],["Greg Smith",4.91,3.33,1.14,0.51,0.1],["Herm Gilliam",9.3,2.5,2.1,1,0.1],["Jim Barnett",18.5,4.8,4.1,null,null],["Jim Marsh",3.1,2.2,0.8,null,null],["Jim McMillian",3.6,1.7,1.4,0.4,0.1],["John Johnson",15.98,6.72,3.43,0.94,0.48],["Johnny Davis",9.38,1.85,2.26,0.75,0.15],["LaRue Martin",5.27,4.6,0.74,0.23,0.51],["Larry Steele",8.2,2.91,2.78,1.81,0.21],["Lenny Wilkens",6.5,1.8,3.6,1.2,0.1],["Leroy Ellis",15.9,12.3,3.2,null,null],["Lionel Hollins",14.18,2.76,4.48,1.93,0.43],["Lloyd Neal",11.14,7.76,1.45,0.51,0.92],["Maurice Lucas",19.07,10.36,2.84,1.01,0.89],["Mo Layton",5.6,1.5,2.3,0.4,0],["Mychal Thompson",14.7,8.3,2.4,0.9,1.8],["Ollie Johnson",8.09,4.7,2.35,0.8,0.4],["Phil Lumpkin",4.2,1.2,3.7,0.4,0.1],["Rick Adelman",9.83,2.85,4.61,null,null],["Rick Roberson",13.5,10.2,1.9,0.9,0.8],["Robin Jones",5.5,4.7,1.3,0.6,0.6],["Ron Brewer",13.3,2.8,2,1.3,1],["Ron Knight",4.69,2.81,0.85,null,null],["Shaler Halimon",8.9,5.3,2.7,null,null],["Sidney Wicks",22.33,10.27,4.14,1.17,0.84],["Stan McKenzie",13.42,3.53,2.3,null,null],["Steve Hawes",7.2,7.3,1.6,0.7,0.4],["Steve Jones",6.5,1.2,1,0.3,0.1],["T.R. Dunn",5.98,3.42,1.04,0.92,0.21],["Terry Dischinger",6.1,3,1.6,null,null],["Tom Owens",14.3,7.8,2.85,0.55,0.6],["Wally Walker",5.15,1.64,0.81,0.2,0],["William Smith",6.86,4.74,0.69,null,null],["Willie McCarter",6.2,1.1,2.2,null,null]]],
    ["POR","1980s",[["Abdul Jeelani",9.6,3.5,1.2,0.5,0.5],["Adrian Branch",7.4,2,0.9,0.7,0],["Audie Norris",4.38,3.1,0.8,0.44,0.35],["Bernard Thompson",3.3,1.3,0.9,0.5,0.2],["Billy Ray Bates",12.36,1.71,2,0.81,0.1],["Bob Gross",7.9,4.12,2.99,1.13,0.77],["Brook Steppe",3.8,1.2,0.6,0.4,0],["Caldwell Jones",3.98,4.91,0.88,0.38,1.07],["Calvin Natt",17.24,6.89,2.14,0.88,0.36],["Charles Jones",1.4,0.8,0.2,0.1,0.2],["Clinton Wheeler",2.5,1,1.7,1,0],["Clyde Drexler",19.84,5.87,5.61,2.29,0.68],["Craig Neal",1.2,0.5,1.5,0.4,0],["Danny Young",6.2,1.5,2.6,1.1,0.1],["Darnell Valentine",9.77,2.28,5.4,1.64,0.06],["Dave Twardzik",8.5,2.3,4.1,1.1,0],["Don Buse",4.7,1.3,2.8,1.1,0],["Fat Lever",8.75,2.75,4.95,1.8,0.3],["Hank McDowell",2.9,2.1,0.5,0.1,0.2],["Jeff Judkins",3.1,1.3,0.5,0.4,0.1],["Jeff Lamp",4.68,1.16,0.78,0.3,0.07],["Jerome Kersey",12.71,5.8,2.12,1.32,0.72],["Jerry Sichting",4.1,0.83,1.77,0.44,0],["Jim Brewer",2.9,3.8,1.1,0.6,0.6],["Jim Paxson",15.96,2.25,3.22,1.39,0.12],["Kelvin Ransey",15.64,2.4,7,1.15,0.1],["Ken Johnson",4.1,3.8,0.3,0.2,0.3],["Kenny Carr",12.35,8.04,1.53,0.71,0.43],["Kermit Washington",11.58,9.5,1.99,0.98,1.34],["Kevin Duckworth",14.27,6.75,0.73,0.49,0.48],["Kevin Kunnert",4.43,4.92,1.21,0.27,0.65],["Kiki Vandeweghe",23.49,2.94,2.19,0.62,0.23],["Linton Townes",4.5,1.2,0.6,0.3,0.1],["Lionel Hollins",10,1,2.5,1.5,0.1],["Mark Bryant",5,3.2,0.6,0.4,0.1],["Maurice Lucas",9.05,5.59,1.91,0.54,0.39],["Michael Holton",4.47,1.34,2.06,0.42,0.06],["Mike Gale",4.3,1.1,1.7,0.9,0.1],["Mike Harper",4.97,3.52,0.58,0.62,0.84],["Mychal Thompson",17.03,8.94,3.49,0.93,1.34],["Pete Verhoeven",4.08,2.54,0.65,0.51,0.27],["Pétur Guðmundsson",3.2,2.7,0.9,0.2,0.4],["Richard Anderson",5.89,3.85,1.54,0.69,0.25],["Ron Brewer",13.56,2.21,2.42,1.2,0.52],["Sam Bowie",10.51,8.05,2.57,0.61,2.48],["Steve Colter",7.92,2.05,3.15,1.2,0.1],["Steve Johnson",13.97,6.03,1.66,0.44,0.79],["T.R. Dunn",6.9,4,1.8,1.2,0.4],["Terry Porter",13.24,3.71,7.79,1.65,0.1],["Tom Owens",13.44,6.63,2.19,0.55,0.65],["Tom Scheffler",1.3,1.9,0.3,0.2,0.3],["Wayne Cooper",9.75,6.74,1.2,0.3,1.5]]],
    ["POR","1990s",[["Aaron McKie",7.95,3.19,2.24,0.95,0.35],["Alaa Abdelnaby",4.97,3.1,0.36,0.29,0.24],["Alvin Williams",6.9,1.5,2,0.7,0],["Arvydas Sabonis",14.17,8.53,2.32,0.86,1.16],["Brian Grant",11.84,9.41,1.4,0.57,0.7],["Buck Williams",10.21,8.74,1.08,0.76,0.63],["Byron Irvin",5.2,1.5,0.9,0.6,0],["Chris Dudley",4.77,8.43,0.47,0.5,1.31],["Clifford Robinson",16.15,5.22,2.08,1.07,1.13],["Clyde Drexler",21.97,6.53,5.79,1.78,0.7],["Damon Stoudamire",12.54,3.42,6.81,1.15,0.1],["Danny Ainge",10.4,2.2,3.05,0.85,0.2],["Danny Young",4.09,1.18,2.24,0.8,0.04],["Dave Johnson",3.7,1.1,0.3,0.2,0],["Dontonio Wingfield",4.04,2.61,0.78,0.38,0.1],["Dražen Petrović",6.99,1.32,1.42,0.3,0],["Ennis Whatley",2.8,0.91,1.44,0.53,0.09],["Gary Grant",4.4,2.02,3.61,0.78,0.09],["Gary Trent",9.76,4.66,1.02,0.55,0.35],["Greg Anthony",6.4,1.3,2,1.3,0.1],["Harvey Grant",9.61,4.4,1.33,0.8,0.63],["Isaiah Rider",16.93,4.31,2.69,0.61,0.28],["James Edwards",2.7,1.5,0.3,0.2,0.3],["James Robinson",7.7,1.8,1.95,0.53,0.23],["Jaren Jackson",2.8,0.6,0.9,0.1,0.1],["Jermaine O'Neal",3.86,3.03,0.29,0.15,0.72],["Jerome Kersey",11.57,6.37,2.16,1.23,0.76],["Jim Jackson",8.4,3.2,2.6,0.9,0.1],["Joe Wolf",2.5,2.1,0.2,0.3,0],["John Crotty",3.73,1.11,2.33,0.43,0],["Kelvin Cato",3.69,3.44,0.34,0.44,1.3],["Kenny Anderson",15.76,3.9,6.5,1.79,0.13],["Kevin Duckworth",13.22,6.04,1.08,0.47,0.45],["Mario Elie",8.6,2.6,2.2,0.9,0.2],["Mark Bryant",4.89,3.58,0.5,0.41,0.26],["Mitchell Butler",3,1.1,0.6,0.3,0],["Otis Thorpe",13.5,6.9,1.6,0.6,0.4],["Randolph Childress",2.39,0.54,0.98,0.34,0],["Rasheed Wallace",14.3,6.06,1.73,0.93,1.07],["Reggie Smith",1.52,1.81,0.07,0.27,0.07],["Rick Brunson",4.3,1.5,2.6,0.7,0.1],["Robert Pack",4.6,1.3,1.9,0.6,0.1],["Rod Strickland",16.98,4.53,8.61,1.7,0.23],["Rumeal Robinson",4.85,1.53,2.76,0.64,0.06],["Stacey Augmon",5.03,2.81,1.15,0.92,0.39],["Steve Henson",3.2,0.7,2.3,0.2,0],["Terry Porter",16.2,3.26,6.44,1.47,0.12],["Tracy Murray",6.16,1.62,0.4,0.25,0.17],["Vincent Askew",2.2,2.3,1.3,0.6,0.2],["Walt Williams",8.95,2.84,1.7,0.72,0.52],["Walter Davis",6.1,1.8,1.3,0.6,0],["Wayne Cooper",2.9,3.47,0.49,0.14,1.01]]],
    ["POR","2000s",[["Antonio Daniels",3.7,1.1,1.3,0.5,0.1],["Antonio Harvey",2.35,1.51,0.3,0.1,0.38],["Arvydas Sabonis",9.13,5.75,1.71,0.74,0.91],["Bonzi Wells",13.5,4.8,2.64,1.37,0.25],["Brandon Roy",19.78,4.62,5.05,1.13,0.24],["Brian Grant",7.3,5.5,1,0.5,0.4],["Brian Skinner",3.8,4.7,0.5,0.5,0.9],["Channing Frye",5.64,3.47,0.57,0.36,0.3],["Charles Smith",3.54,0.7,0.39,0.21,0.26],["Chris Dudley",1.03,1.82,0.28,0.09,0.28],["Dale Davis",7.14,7.19,1.15,0.65,0.93],["Damon Stoudamire",12.78,3.52,5.53,1.05,0.07],["Dan Dickau",3.01,0.79,1.29,0.33,0],["Darius Miles",13.07,4.64,1.94,1.11,1.03],["Derek Anderson",12.04,3.14,3.75,1.09,0.13],["Detlef Schrempf",6.62,3.97,2.37,0.45,0.17],["Eddie Gill",2.3,0.8,0.7,0.4,0],["Fred Jones",4.8,1.4,2.2,0.8,0.2],["Greg Anthony",5.72,1.39,2.04,0.7,0.1],["Greg Oden",8.9,7,0.5,0.4,1.1],["Ha Seung-Jin",1.52,1.43,0.04,0.1,0.3],["Ime Udoka",8.4,3.7,1.5,0.9,0.2],["Jamaal Magloire",6.5,6.1,0.4,0.3,0.8],["James Jones",8,2.8,0.6,0.4,0.3],["Jarrett Jack",9.54,2.5,3.96,0.77,0.03],["Jeff McInnis",7.89,1.68,3.22,0.51,0.03],["Jermaine O'Neal",3.9,3.3,0.3,0.2,0.8],["Jerryd Bayless",4.3,1.1,1.5,0.3,0],["Joel Przybilla",5.19,7.5,0.57,0.31,1.64],["Juan Dixon",10.87,1.96,1.79,0.84,0.1],["LaMarcus Aldridge",15.39,6.82,1.37,0.7,1.13],["Martell Webster",8.12,3.01,0.8,0.44,0.27],["Nick Van Exel",11.1,3,4.3,0.8,0],["Nicolas Batum",5.4,2.8,0.9,0.6,0.5],["Qyntel Woods",3.05,1.65,0.47,0.3,0.11],["Raef LaFrentz",2.52,2.07,0.24,0.3,0.4],["Rasheed Wallace",18.08,7.47,2.19,1.09,1.38],["Richie Frahm",3.8,1.4,0.7,0.3,0.1],["Rick Brunson",2.1,1.2,1.9,0.4,0],["Rod Strickland",4.6,1.7,3.4,0.5,0],["Ruben Boumtje-Boumtje",0.98,1.32,0.12,0.1,0.4],["Ruben Patterson",9.72,3.7,1.59,1.13,0.37],["Rudy Fernández",10.4,2.7,2,0.9,0.2],["Scottie Pippen",11.38,5.32,4.99,1.52,0.5],["Sebastian Telfair",8.15,1.65,3.45,0.75,0.1],["Sergio Rodríguez",3.6,1.28,2.88,0.51,0],["Shareef Abdur-Rahim",14.27,6.26,1.88,0.86,0.54],["Shawn Kemp",6.29,3.8,0.84,0.65,0.35],["Stacey Augmon",4.09,2.21,1.22,0.61,0.25],["Steve Blake",9.2,2.34,4.88,0.76,0.06],["Steve Kerr",4.1,0.9,1,0.2,0],["Steve Smith",14.25,3.6,2.55,0.75,0.35],["Theo Ratliff",5.37,5.65,0.52,0.45,2.58],["Travis Outlaw",9.56,3.38,0.85,0.61,0.78],["Viktor Khryapa",5.29,4.08,1.14,0.67,0.46],["Vladimir Stepania",2.6,3,0.5,0.3,0.4],["Wesley Person",6.5,2.2,1.2,0.3,0.2],["Zach Randolph",16.01,7.72,1.53,0.66,0.28]]],
    ["POR","2010s",[["Al-Farouq Aminu",9.45,7.11,1.45,0.94,0.57],["Allen Crabbe",8.32,2.34,1.06,0.63,0.25],["Andre Miller",13.35,3.45,6.2,1.25,0.1],["Anfernee Simons",3.8,0.7,0.7,0.1,0],["Armon Johnson",2.88,0.9,1.17,0.12,0],["Arron Afflalo",10.6,2.7,1.1,0.4,0.1],["Brandon Roy",17.6,3.64,3.86,0.86,0.24],["Brian Roberts",2.9,0.6,0.8,0.1,0],["CJ McCollum",17.84,3.14,2.93,0.88,0.33],["Caleb Swanigan",2.14,2.36,0.46,0.2,0.06],["Chris Johnson",1.97,1.5,0.13,0.17,0.47],["Chris Kaman",7.57,5.61,0.86,0.18,0.59],["Craig Smith",3.3,2.3,0.4,0.3,0.1],["Damian Lillard",23.52,4.16,6.35,0.99,0.33],["Dante Cunningham",4.46,2.92,0.34,0.54,0.44],["Dorell Wright",4.83,2.59,0.9,0.34,0.2],["Earl Watson",0.5,0.6,1.2,0.2,0],["Ed Davis",5.55,6.93,0.76,0.5,0.73],["Elliot Williams",3.7,0.8,0.3,0.3,0.1],["Enes Freedom",13.1,8.6,1.4,0.6,0.4],["Eric Maynor",6.9,1,4,0.4,0],["Evan Turner",7.97,3.78,3.07,0.63,0.33],["Gerald Henderson",8.7,2.9,1,0.5,0.3],["Gerald Wallace",14.18,6.95,2.63,1.68,0.64],["Greg Oden",11.1,8.5,0.9,0.4,2.3],["J.J. Hickson",13.16,10,1.12,0.6,0.66],["Jake Layman",4.62,1.86,0.5,0.33,0.25],["Jamal Crawford",14,2,3.2,0.9,0.2],["Jared Jeffries",1.2,1.6,0.4,0.2,0.2],["Jeff Ayres",2.7,2.5,0,0.2,0.4],["Jerryd Bayless",8.5,1.6,2.3,0.4,0.1],["Joel Freeland",3.13,3.43,0.44,0.23,0.36],["Joel Przybilla",2.65,5.63,0.3,0.2,0.84],["Jusuf Nurkić",14.95,9.75,2.55,0.94,1.46],["Juwan Howard",6,4.6,0.8,0.4,0.1],["Kurt Thomas",3,3.5,0.9,0.5,0.6],["LaMarcus Aldridge",21.45,9.21,2.24,0.87,0.97],["Luke Babbitt",3.82,2.09,0.43,0.21,0.1],["Marcus Camby",4.84,9.99,1.92,0.81,1.61],["Martell Webster",9.4,3.3,0.8,0.5,0.5],["Mason Plumlee",9.89,7.82,3.28,0.84,1.08],["Maurice Harkless",7.72,3.83,1.02,0.89,0.71],["Meyers Leonard",5.57,3.72,0.87,0.18,0.29],["Mo Williams",9.7,2.1,4.3,0.7,0.1],["Nicolas Batum",12.35,5.51,3.39,0.98,0.78],["Nik Stauskas",6.1,1.8,1.4,0.3,0.1],["Noah Vonleh",3.92,4.63,0.4,0.32,0.34],["Nolan Smith",3.32,1.01,1.16,0.3,0.05],["Pat Connaughton",3.73,1.58,0.82,0.23,0.18],["Patty Mills",5.11,0.72,1.54,0.35,0],["Raymond Felton",11.4,2.5,6.5,1.3,0.2],["Robin Lopez",10.47,7.75,0.9,0.3,1.57],["Rodney Hood",9.6,1.7,1.3,0.8,0.3],["Ronnie Price",2.7,1.1,1.9,0.7,0.1],["Rudy Fernández",8.38,2.38,2.28,1.06,0.2],["Sasha Pavlović",2.6,1.4,0.8,0.6,0.1],["Sean Marks",1.6,1.4,0.1,0.1,0.2],["Seth Curry",7.9,1.6,0.9,0.5,0.2],["Shabazz Napier",6.78,1.84,1.71,0.89,0.12],["Steve Blake",5.58,1.93,3.75,0.58,0.06],["Thomas Robinson",4.42,4.34,0.44,0.36,0.3],["Tim Frazier",1.89,1.19,1.48,0.31,0],["Victor Claver",3.2,2.22,0.72,0.34,0.16],["Wade Baldwin",2.97,0.96,0.77,0.16,0.1],["Wesley Matthews",15.4,3.29,2.18,1.22,0.2],["Will Barton",3.79,1.76,0.82,0.41,0.13],["Zach Collins",5.58,3.78,0.85,0.3,0.72]]],
    ["POR","2020s",[["Carmelo Anthony",13.4,3.1,1.5,0.7,0.6],["Jrue Holiday",16.3,4.6,6.1,1,0.1],["Eric Bledsoe",9.9,3.4,4.2,1.3,0.4],["Enes Freedom",11.2,11,1.2,0.5,0.7],["Damian Lillard",28.3,4.4,7.4,0.8,0.3],["Ben McLemore",10.2,1.6,0.9,0.6,0.2],["CJ McCollum",23.1,3.9,4.7,0.9,0.4],["Cody Zeller",5.2,4.6,0.8,0.3,0.2],["Robert Covington",8.5,6.7,1.7,1.4,1.2],["Jerami Grant",18.6,3.8,2.4,0.8,0.8],["Jusuf Nurkić",13.3,9.7,3,1,0.8],["Joe Ingles",7.2,2.9,3.5,0.5,0.1],["Justise Winslow",6.2,4.6,2.6,0.8,0.5],["Rondae Hollis-Jefferson",2.5,2.4,1.2,0.2,0.4],["Norman Powell",18.6,3.1,1.9,1.2,0.3],["Kris Dunn",7.6,3.5,5.6,1.6,0.2],["Malcolm Brogdon",15.7,3.8,5.5,0.7,0.2],["Derrick Jones Jr.",6.8,3.5,0.8,0.6,0.9],["Dennis Smith Jr.",5.6,2.4,3.6,1.2,0.3],["Harry Giles III",2.8,3.5,0.8,0.2,0.3],["T.J. Leaf",1.7,0.7,0.1,0.3,0.1],["Josh Hart",14.9,7.2,4.1,1.1,0.2],["Chance Comanche",7,3,0,0,1],["Kevin Knox II",6.9,2.6,0.6,0.4,0.2],["Anfernee Simons",17.6,2.7,3.9,0.6,0.1],["Deandre Ayton",15.6,10.6,1.6,0.9,0.9],["Robert Williams III",6.4,6.4,1,0.8,1.5],["Drew Eubanks",7.2,5.4,1.2,0.5,0.9],["Jarron Cumberland",0.7,1,0.3,0,0],["CJ Elleby",4,2.5,0.9,0.4,0.2],["Reggie Perry",9.2,4.7,1.2,0.9,0.6],["Cam Reddish",9.7,2.2,1.4,1,0.4],["Nassir Little",7,3.6,0.9,0.4,0.5],["Moses Brown",3.4,3.9,0.3,0.2,0.3],["Matisse Thybulle",5.7,2.4,1.2,1.8,0.6],["Didi Louzada",3.9,1.9,0.6,0.2,0.2],["Keljin Blevins",1.9,1.1,0.4,0.2,0],["Deni Avdija",20.5,7.1,5.3,0.9,0.6],["Elijah Hughes",3.5,1.6,0.6,0.4,0.2],["Ashton Hagans",4.2,2.4,2.8,0.6,0.5],["Skylar Mays",15.3,3.2,8.3,1,0.2],["Vít Krejčí",8.5,2.3,1.5,0.7,0.3],["Brandon Williams",12.9,3.1,3.9,1,0.4],["Greg Brown III",3.2,2,0.4,0.4,0.4],["Keon Johnson",6,1.7,1.8,0.7,0.2],["Trendon Watford",7.5,3.9,1.9,0.5,0.4],["Dalano Banton",9.3,2.6,2.4,0.6,0.5],["Ibou Badji",1.5,2.3,0.6,0.1,0.9],["Scoot Henderson",13.6,2.9,4.7,0.9,0.2],["Cameron McGriff",4.7,5,1,0,0.3],["Shaedon Sharpe",16.3,4.2,2.4,0.9,0.2],["Blake Wesley",4.8,1.3,2,0.5,0.2],["Bryce McGowens",1,0.2,0.2,0.1,0],["Caleb Love",10.4,2.3,2.5,0.6,0.1],["Jabari Walker",6,4.3,0.7,0.5,0.2],["Kris Murray",5.4,3.3,1.2,0.8,0.3],["John Butler Jr.",2.4,0.9,0.6,0.4,0.5],["Justin Minaya",2.3,2,0.7,0.4,0.6],["Sidy Cissoko",3.3,1.6,1.1,0.4,0.1],["Taze Moore",3.8,3,0.9,0.8,0],["Javonte Cooke",1.2,1,0.4,0.3,0],["Nate Williams",10.6,3,2,0.6,0.4],["Rayan Rupert",3.5,1.9,1.1,0.3,0.1],["Toumani Camara",10.7,5.3,2,1.2,0.5],["Duop Reath",5.4,2.3,0.6,0.3,0.4],["Donovan Clingan",9.3,9.8,1.6,0.6,1.6],["Yang Hansen",2.2,1.5,0.5,0.1,0.2],["Chris Youngblood",2.1,0.8,0.4,0.1,0.1],["Jayson Kent",2,1,0,0.2,0.2]]],
    ["SAC","1960s",[["Adrian Smith",12.73,2.38,2.47,null,null],["Al Tucker",10.8,4.4,0.7,null,null],["Bevo Nordmann",2.3,2.2,0.3,null,null],["Bill Dinwiddie",4.64,3.5,0.65,null,null],["Bob Boozer",12,8.74,1.38,null,null],["Bob Love",6.54,3.38,0.75,null,null],["Bob Wiesenhahn",2,1.9,0.4,null,null],["Bucky Bockhorn",11.69,4.39,3.59,null,null],["Bud Olsen",4.97,3.24,0.87,null,null],["Connie Dierking",12.46,7.92,2.1,null,null],["Dave Piontek",6.5,4.39,1.07,null,null],["Dave Zeller",1.5,0.4,1,null,null],["Flynn Robinson",8.69,1.81,1.43,null,null],["Fred Foster",3.4,1.1,0.6,null,null],["Fred Hetzel",11.9,4.5,0.9,null,null],["Freddie Lewis",4.7,1.4,1.3,null,null],["Gary Gray",2.4,0.5,0.6,null,null],["George Wilson",2.6,2.48,0.31,null,null],["Guy Rodgers",4.8,1.8,4.7,null,null],["Happy Hairston",13.08,7.03,0.72,null,null],["Hub Reed",6.59,5.99,0.9,null,null],["Jack Twyman",19.69,6.54,2.33,null,null],["Jay Arnette",3.72,1.02,1.24,null,null],["Jerry Lucas",19.67,19.15,3.04,null,null],["Jim Fox",3.2,3.1,0.4,null,null],["Jim Palmer",9.1,5.6,0.9,null,null],["Jim Ware",2.1,2.1,0.2,null,null],["Joe Buckhalter",5.75,4.12,0.68,null,null],["John Tresvant",11.31,7.24,1.81,null,null],["Jon McGlocklin",6.65,2.21,1.38,null,null],["Larry Staverman",4.2,3.76,0.92,null,null],["Len Chappell",4.05,2.6,0.42,null,null],["Med Park",8.7,4.1,2.9,null,null],["Mike Farmer",7.5,6.6,1.4,null,null],["Oscar Robertson",29.66,8.73,10.5,null,null],["Pat Frink",2.6,0.9,1.1,null,null],["Phil Jordon",12.42,8.5,2.57,null,null],["Phil Rollins",4.9,2.19,2.81,null,null],["Ralph Davis",5.4,1.2,2.4,null,null],["Tom Hawkins",8.35,6.56,1.15,null,null],["Tom Thacker",2.99,2.36,0.99,null,null],["Tom Van Arsdale",17.06,4.29,2.73,null,null],["Walt Wesley",6.54,4.77,0.48,null,null],["Wayne Embry",14.42,10.54,1.57,null,null],["Win Wilfong",7.56,3.74,2.64,null,null],["Zaid Abdul-Aziz",1.9,1.6,0.2,null,null]]],
    ["SAC","1970s",[["Adrian Smith",5.4,1,1.4,null,null],["Andre McCarter",4.52,0.9,1.67,0.39,0],["Bill Robinzine",10.48,6.39,1.08,1.1,0.15],["Bill Turner",7.2,4.2,0.6,null,null],["Billy McKinney",7.8,1.1,3.2,0.7,0],["Bob Arnzen",5.5,2.8,0.4,null,null],["Bob Bigelow",2.33,0.97,0.3,0.1,0],["Bob Nash",6,2.54,0.81,0.4,0.24],["Brian Taylor",17,3.3,4.4,2.8,0.2],["Charlie Paulk",9.2,4.7,0.4,null,null],["Connie Dierking",16.56,8.18,2.18,null,null],["Darnell Hillman",7,5.5,1.2,0.6,0.8],["Darrall Imhoff",6.95,6.08,1.86,null,null],["Dick Gibbs",3.1,1.4,0.9,null,null],["Don Kojis",10.14,3.57,1.12,0.91,0.16],["Don May",2.2,0.4,0.2,0.1,0.1],["Flynn Robinson",13.3,2,1.9,null,null],["Fred Foster",14.7,4.2,1.38,null,null],["Fred Taylor",3.4,1.8,0.5,null,null],["Gil McGregor",4.1,3.5,0.4,null,null],["Glenn Hansen",5.32,2.21,0.83,0.54,0.16],["Greg Hyder",5.4,4.3,0.6,null,null],["Gus Gerard",3.8,1.7,0.4,0.3,0.2],["Herm Gilliam",7.5,3.8,3.1,null,null],["Howard Komives",4.3,1,2.2,0.7,0.1],["Jim Eakins",6,4.4,1.5,0.4,0.6],["Jim Fox",12.3,9.3,1.1,null,null],["Jim King",2.9,1.5,1.4,null,null],["Jimmy Walker",17.36,2.74,3.12,1.1,0.17],["John Block",8.77,4.72,1.03,0.8,0.4],["John Kuester",4.8,1.5,3.2,0.7,0],["John Mengelt",9.37,1.89,1.93,null,null],["Johnny Green",12.43,8.02,1.27,null,null],["Ken Durrett",4.28,1.84,0.46,0.27,0.13],["Kevin Restani",2.8,2,0.5,0.1,0.1],["Larry McNeill",8.76,5.32,0.77,0.71,0.29],["Lee Winfield",3.3,1.1,0.9,0.5,0.3],["Len Kosmalski",1.41,1.92,0.68,0.12,0.14],["Lucius Allen",9.95,2.57,3.75,1.06,0.34],["Luther Rackley",7.6,5.7,0.8,null,null],["Marlon Redmond",7.2,2.2,1.2,0.6,0.3],["Matt Guokas",7.15,2.41,4.3,0.41,0.1],["Mike Barr",3.9,1.8,2.4,0.7,0.2],["Mike D'Antoni",3.39,1.42,1.94,1.17,0.23],["Mike Ratliff",4.06,3.19,0.68,0,0],["Moe Barr",2,0.6,0.9,null,null],["Nate Williams",12.98,4.21,1.91,1.53,0.44],["Norm Van Lier",12.45,6.04,7.98,null,null],["Ollie Johnson",7.89,3.3,1.46,0.64,0.4],["Oscar Robertson",25.3,6.1,8.1,null,null],["Otis Birdsong",18.92,3.41,2.93,1.26,0.2],["Otto Moore",3.2,3.1,0.7,0.2,0.5],["Phil Ford",15.9,2.3,8.6,2.2,0.1],["Richard Washington",11.81,7.87,1.16,0.8,0.92],["Rick Roberson",2.5,3.1,0.7,0.2,0.2],["Ron Behagen",10.59,7,1.74,0.67,0.48],["Ron Boone",19.95,3.6,3.95,1.4,0.15],["Ron Riley",7.95,6.59,0.96,0.3,0.2],["Sam Lacey",11.88,11.25,3.73,1.55,1.8],["Scott Wedman",15.56,6.16,2.27,1.14,0.34],["Tiny Archibald",25.17,2.79,8.09,1.56,0.16],["Toby Kimball",3.5,2.9,0.4,null,null],["Tom Burleson",8.26,5.75,1.36,0.67,1.06],["Tom Van Arsdale",20.02,5.39,2.26,null,null],["Wally Anderzunas",3.6,1.9,0.2,null,null]]],
    ["SAC","1980s",[["Bill Robinzine",11.4,6.5,0.8,1.3,0.3],["Billy Knight",11.39,3.05,1.96,0.59,0.1],["Billy McKinney",6.8,1.1,3.3,0.8,0.1],["Brad Lohaus",8,3.9,0.6,0.3,1],["Brook Steppe",5.35,1.41,1.56,0.44,0.04],["Cliff Robinson",20.2,8.5,1.9,1.2,1.6],["Dane Suttle",5.95,1.11,1.08,0.46,0],["Danny Ainge",20.3,3.6,6.7,1.5,0.3],["David Pope",1.9,0.8,0.2,0.1,0.1],["Derek Smith",13.77,3.14,3.03,0.76,0.41],["Don Buse",4.26,1.22,3.59,0.87,0],["Ed Nealy",3.43,4.27,0.76,0.63,0.09],["Ed Pinckney",8.59,4.08,1.07,0.74,0.56],["Eddie Johnson",18.7,5.1,2.8,0.79,0.23],["Ernie Grunfeld",8.72,2.56,2.47,0.8,0.27],["Frankie Sanders",3.8,0.9,0.7,0.7,0],["Franklin Edwards",6.7,1.23,5.07,0.6,0.07],["Gus Gerard",4.99,2.29,0.56,0.53,0.4],["Harold Pressley",9.11,4.54,2.12,0.99,0.69],["Hawkeye Whitney",5.72,2.1,1.2,0.84,0.07],["Jawann Oldham",5.5,5.6,0.6,0.2,2],["Jim Petersen",10.2,6.3,1.2,0.7,1],["Joe Kleine",7.5,5.83,0.84,0.34,0.49],["Joe Meriweather",6.67,4.76,0.73,0.44,0.87],["John Lambert",3.4,2.54,0.6,0.3,0.15],["Johnny Rogers",4.2,1.7,0.6,0.2,0.2],["Kenny Dennard",3.43,3.55,0.93,0.99,0.17],["Kenny Smith",15.8,2.59,7.44,1.39,0.1],["Kevin Loder",5.95,2.28,1.17,0.44,0.27],["LaSalle Thompson",10.47,8.32,1.3,0.89,1.39],["Larry Drew",14.75,2.11,6.39,1.4,0.06],["Larry Micheaux",3.1,2.9,0.5,0.5,0.3],["Len Elmore",4.5,4.4,1.1,0.7,0.7],["Leon Douglas",4.41,4.65,0.74,0.25,0.55],["Lloyd Walton",3.4,0.8,3.4,0.5,0],["Mark McNamara",2.4,1.7,0.2,0.2,0.2],["Mark Olberding",7.69,4.89,2.49,0.5,0.2],["Marlon Redmond",5.9,2.2,0.8,0.2,0.4],["Michael Jackson",2.47,0.86,2.65,0.28,0.08],["Mike Bratz",2.1,0.7,1.2,0.4,0],["Mike Green",7.7,5.4,1.3,0.6,1],["Mike McGee",14.2,3,1.6,1.3,0.2],["Mike Woodson",16.32,2.81,2.5,1.46,0.48],["Othell Wilson",4,1.5,3.9,0.8,0.1],["Otis Birdsong",23.58,3.81,2.87,1.51,0.3],["Otis Thorpe",15.72,8.21,2.07,0.58,0.6],["Pete Verhoeven",2.3,1.2,0.3,0.3,0.1],["Phil Ford",14.53,1.84,7.46,1.38,0.03],["Randy Wittman",3.8,0.8,1,0.3,0],["Ray Williams",15.4,4.5,7.9,1.7,0.4],["Reggie Johnson",9.98,4.8,1,0.48,0.65],["Reggie King",10.38,7.01,1.54,0.96,0.39],["Reggie Theus",18.79,3.35,8.12,1.1,0.21],["Rich Kelley",2,2.2,1.2,0.3,0.1],["Ricky Berry",11,3.1,1.3,0.6,0.3],["Rodney McCray",12.6,7.6,4.3,0.8,0.5],["Sam Lacey",7.98,7.48,5.26,1.3,1.39],["Scott Wedman",19,5.48,2.48,1.2,0.65],["Steve Johnson",11.61,5.34,1.22,0.48,1.08],["Terry Tyler",8.12,3.9,0.99,0.73,1.03],["Tom Burleson",2.6,1.9,0.5,0.2,0.4],["Vinny Del Negro",7.1,2.1,2.6,0.8,0.2],["Wayman Tisdale",19.8,9.6,1.7,0.6,0.6]]],
    ["SAC","1990s",[["Alaa Abdelnaby",5,2.1,0.3,0.3,0.2],["Andre Spencer",6,2.7,0.8,0.8,0.2],["Anthony Bonner",8.72,5.99,1.49,1.18,0.22],["Anthony Frederick",5.1,2.4,1.3,0.6,0.4],["Anthony Johnson",7.5,2.2,4.3,0.8,0.1],["Antoine Carr",19.65,5.41,2.35,0.57,1.21],["Bill Wennington",5.7,4.4,0.9,0.6,0.8],["Billy Owens",10.62,6.63,2.85,1.04,0.49],["Bob Hansen",6.27,2.66,2.39,0.59,0.09],["Bobby Hurley",3.78,1.04,3.24,0.46,0.03],["Brian Grant",13.36,7.07,1.37,0.58,1.35],["Byron Houston",3.4,3.4,0.3,0.5,0.3],["Chris Webber",20,13,4.1,1.4,2.1],["Corliss Williamson",12.53,4.17,1.69,0.7,0.44],["Danny Ainge",17.9,4.3,6,1.5,0.2],["Dennis Hopson",10.7,3,1.5,1,0.6],["Doug Lee",2,0.2,0.2,0.3,0.1],["Duane Causwell",5.53,4.68,0.53,0.47,1.62],["Dwayne Schintzius",3.3,3.6,0.6,0.2,0.8],["Eric Leckner",2.9,2.7,0.6,0.1,0.3],["Greg Kite",3.2,5.3,1.1,0.4,0.7],["Harold Pressley",8.8,4.3,2.1,0.8,0.5],["Henry Turner",3.39,1.17,0.42,0.41,0.11],["Jason Williams",12.8,3.1,6,1.9,0],["Jeff Grayer",3.6,1.5,1,0.3,0.3],["Jim Les",4.8,1.31,3.11,0.62,0.07],["Jon Barry",5,2.2,2.6,1.2,0.1],["Kenny Smith",15,2.6,6.6,1.2,0.2],["Kevin Gamble",4.72,1.6,1.12,0.27,0.25],["Kevin Salvadori",1.07,1.18,0.32,0.06,0.64],["Kurt Rambis",2.5,3.3,0.8,0.6,0.3],["LaBradford Smith",5.1,1.3,1.8,0.6,0.1],["Lawrence Funderburke",9.22,4.59,0.92,0.45,0.39],["Les Jepsen",0.8,1,0,0,0.2],["Lionel Simmons",12.85,6.24,3.29,1.13,0.82],["Mahmoud Abdul-Rauf",11.83,1.48,2.32,0.64,0.07],["Mark Hendrickson",3.4,3,0.9,0.5,0.2],["Marty Conlon",4.8,2.7,0.8,0.3,0.1],["Michael Hawkins",1.5,1,1.1,0.1,0],["Michael Smith",6.2,7.09,1.62,0.81,0.65],["Michael Stewart",4.6,6.6,0.8,0.4,2.4],["Mike Peplowski",3.2,3.1,0.4,0.3,0.5],["Mitch Richmond",23.35,3.75,4.11,1.31,0.28],["Olden Polynice",10.85,8.86,1.23,0.58,0.78],["Otis Thorpe",8.3,6.1,2.3,0.7,0.3],["Peja Stojaković",8.4,3,1.5,0.9,0.1],["Pervis Ellison",8,5.8,1.9,0.5,1.7],["Pete Chilcutt",5.43,3.75,1.01,0.57,0.37],["Ralph Sampson",3.61,3.79,0.9,0.45,0.75],["Randy Allen",3.7,2.2,0.4,0.3,0.3],["Randy Breuer",0.7,2.2,0.3,0.2,0.7],["Randy Brown",5.21,1.91,2.03,1.16,0.31],["Rick Calloway",3.2,1.2,1,0.3,0.1],["Rod Higgins",8.3,2.8,1.7,0.7,0.4],["Rodney McCray",16.6,8.2,4.6,0.7,0.9],["Rory Sparrow",10.4,2.3,4.5,1,0.2],["Sedric Toney",5.5,1.4,3.8,0.7,0],["Spud Webb",13.68,2.7,6.74,1.32,0.2],["Tariq Abdul-Wahad",7.72,2.82,0.95,0.78,0.25],["Terry Dehere",6.2,1.36,2.39,0.69,0.1],["Travis Mays",14.3,2.8,4,1.3,0.2],["Trevor Wilson",6.9,4.03,1.11,0.53,0.18],["Tyrone Corbin",6.4,3.7,1.2,1,0.3],["Tyus Edney",8.98,2.08,4.75,1.01,0],["Vernon Maxwell",10.7,1.8,1.7,0.7,0.1],["Vinny Del Negro",9.7,2.6,3.3,0.8,0.1],["Vlade Divac",14.3,10,4.3,0.9,1],["Walt Williams",14.96,4.42,3.32,1.23,0.65],["Wayman Tisdale",18.28,7.01,1.57,0.67,0.77],["Šarūnas Marčiulionis",10.8,1.5,2.2,1,0.1]]],
    ["SAC","2000s",[["Andrés Nocioni",13.7,6,1.8,0.6,0.7],["Anthony Johnson",3.9,1.4,2.2,0.4,0],["Anthony Peeler",5.7,2,1.6,0.7,0.1],["Beno Udrih",11.85,3.14,4.51,1.01,0.2],["Bobby Brown",5.2,0.8,1.9,0.3,0],["Bobby Jackson",10.65,3.21,2.22,0.98,0.11],["Bonzi Wells",13.6,7.7,2.8,1.8,0.5],["Brad Miller",13.29,8.6,4,0.87,0.92],["Brent Price",1.6,0.4,0.5,0.2,0.1],["Brian Skinner",4.32,5.08,0.84,0.58,0.98],["Chris Webber",23.91,10.33,4.83,1.52,1.38],["Corliss Williamson",8.54,3.23,0.85,0.41,0.21],["Cuttino Mobley",17.8,3.9,3.4,1.2,0.5],["Dahntay Jones",3.2,1.4,0.5,0.3,0.2],["Damon Jones",4.6,1.4,1.6,0.4,0.1],["Darius Songaila",6.13,3.68,1.07,0.6,0.2],["Darrick Martin",4.97,0.57,1.34,0.34,0],["Donté Greene",3.8,1.6,0.5,0.3,0.3],["Doug Christie",10.63,4.3,4.24,2.04,0.47],["Eddie House",4.7,1.2,1.3,0.4,0.1],["Francisco García",9.13,3.02,1.57,0.9,0.69],["Gerald Wallace",3.39,2.08,0.5,0.43,0.25],["Greg Ostertag",1.6,3,0.7,0.1,0.7],["Hedo Türkoğlu",7.46,3.42,1.42,0.61,0.31],["Jabari Smith",2.1,1.03,0.48,0.18,0.19],["Jason Hart",3.3,1.12,1.05,0.45,0.08],["Jason Thompson",11.1,7.4,1.1,0.6,0.7],["Jason Williams",10.89,2.61,6.37,1.3,0.1],["Jim Jackson",7.7,4.2,1.9,0.5,0.1],["John Salmons",12.46,3.9,3.1,1.03,0.31],["Jon Barry",6.55,2.05,2.25,0.85,0.1],["Justin Williams",3.35,3.39,0.05,0.2,0.42],["Kenny Thomas",7.41,6.45,1.63,0.78,0.35],["Keon Clark",6.7,5.6,1,0.5,1.9],["Kevin Martin",16.91,3.62,1.81,0.95,0.12],["Lawrence Funderburke",5.09,3.12,0.41,0.24,0.29],["Mateen Cleaves",1.95,0.41,0.8,0.2,0],["Matt Barnes",3.8,3.1,1.3,0.7,0.2],["Maurice Evans",6.4,3.1,0.7,0.6,0.1],["Metta World Peace",18.93,5.95,3.63,2.14,0.68],["Mike Bibby",17.61,3.24,5.41,1.25,0.18],["Mikki Moore",6.7,5.03,0.86,0.36,0.49],["Nick Anderson",8.77,3.91,1.45,1.12,0.2],["Peja Stojaković",19.35,5.19,2.06,1.05,0.16],["Quincy Douby",4.09,1.07,0.61,0.36,0.18],["Rashad McCants",10.3,2,1.5,0.8,0.3],["Rodney Buford",1.9,0.7,0.3,0.3,0],["Ronnie Price",2.9,0.97,0.67,0.4,0.07],["Scot Pollard",5.96,6.01,0.6,0.72,1],["Shareef Abdur-Rahim",10.68,4.87,1.69,0.68,0.53],["Shelden Williams",4.42,3.03,0.3,0.35,0.35],["Spencer Hawes",8.19,5.23,1.28,0.41,0.91],["Tony Delk",6.4,1.9,1.2,0.8,0.1],["Tony Massenburg",4.3,3.2,0.5,0.2,0.3],["Tyrone Corbin",4.1,3.1,1.1,0.7,0.1],["Vlade Divac",11.05,7.52,3.66,1.02,1.18]]],
    ["SAC","2010s",[["Aaron Brooks",8,1.7,2.3,0.6,0.2],["Aaron Gray",1.8,3.1,0.6,0.3,0.2],["Andre Miller",5.7,2.5,4.7,0.6,0.1],["Andrés Nocioni",8.5,3,1,0.4,0.3],["Anthony Tolliver",7.1,3.6,1.2,0.5,0.3],["Arron Afflalo",8.4,2,1.3,0.3,0.1],["Ben McLemore",9.01,2.47,1.14,0.66,0.16],["Beno Udrih",13.3,3.1,4.8,1.15,0.1],["Bogdan Bogdanović",12.89,3.18,3.54,0.95,0.2],["Buddy Hield",16.87,4.37,2.15,0.88,0.32],["Carl Landry",10.14,4.5,0.63,0.46,0.32],["Chuck Hayes",2.82,3.99,1.34,0.55,0.23],["Corey Brewer",4.1,2.5,1.2,0.8,0.2],["Darnell Jackson",3.2,1.6,0.2,0.2,0.1],["Darren Collison",14.21,2.48,4.72,1.12,0.15],["De'Aaron Fox",14.6,3.33,5.93,1.32,0.46],["DeMarcus Cousins",21.05,10.75,2.99,1.4,1.17],["Derrick Williams",8.4,3.51,0.75,0.6,0.15],["Donté Greene",6.73,2.59,0.75,0.45,0.51],["Eugene Jeter",4.1,1.1,2.6,0.5,0],["Francisco García",7.02,2.12,1.09,0.75,0.8],["Frank Mason III",6.72,1.91,2.55,0.57,0.16],["Garrett Temple",7.88,2.48,2.18,1.07,0.39],["George Hill",10.3,2.7,2.8,0.9,0.3],["Georgios Papagiannis",4.13,3.23,0.77,0.1,0.63],["Harrison Barnes",14.3,5.5,1.9,0.6,0.1],["Harry Giles",7,3.8,1.5,0.5,0.4],["Iman Shumpert",8.9,3.1,2.2,1.1,0.5],["Ime Udoka",3.6,2.8,0.8,0.5,0.1],["Isaiah Thomas",15.31,2.48,4.8,0.97,0.06],["J.J. Hickson",4.7,5.1,0.6,0.5,0.5],["JaKarr Sampson",4.7,3.5,0.4,0.4,1],["James Anderson",3.5,1.7,0.8,0.4,0.3],["James Johnson",5.1,2.7,1.1,0.8,0.9],["Jason Thompson",9.04,6.84,1.1,0.49,0.73],["Jermaine Taylor",7.1,2,1.2,0.5,0.1],["Jimmer Fredette",7.03,1.1,1.53,0.41,0.02],["John Salmons",7.99,2.75,2.59,0.73,0.28],["Jon Brockman",2.8,4.1,0.4,0.3,0.1],["Justin Jackson",6.7,2.8,1.19,0.4,0.24],["Kenny Thomas",1.6,3.3,0.6,0.4,0.4],["Kevin Martin",19.8,4.3,2.6,1,0.2],["Kosta Koufos",6.22,5.61,0.78,0.54,0.66],["Luther Head",5.6,1.7,1.9,0.3,0.3],["Malachi Richardson",3.55,1.16,0.5,0.31,0],["Marco Belinelli",10.2,1.7,1.9,0.5,0],["Marcus Thornton",14.41,3.16,1.68,1.06,0.16],["Marvin Bagley III",14.9,7.6,1,0.5,1],["Matt Barnes",7.6,5.4,2.8,0.7,0.3],["Nemanja Bjelica",9.6,5.8,1.9,0.7,0.7],["Nik Stauskas",4.4,1.2,0.9,0.3,0.2],["Omri Casspi",9.62,4.61,1.26,0.69,0.16],["Patrick Patterson",7.54,5.21,1.13,0.62,0.38],["Quincy Acy",3.98,3.39,0.45,0.4,0.4],["Rajon Rondo",11.9,6,11.7,2,0.1],["Ramon Sessions",5.4,1.9,2.7,0.4,0],["Ray McCallum",6.92,2.28,2.76,0.62,0.2],["Reggie Evans",4.31,6.84,0.7,0.67,0.07],["Rudy Gay",19.31,6.04,2.8,1.24,0.67],["Ryan Hollins",3,2.2,0.3,0.1,0.4],["Samuel Dalembert",8.1,8.2,0.8,0.5,1.5],["Sean May",3.3,1.9,0.5,0.3,0.2],["Sergio Rodríguez",6,1.3,3.1,0.7,0.1],["Seth Curry",6.8,1.4,1.5,0.5,0.1],["Skal Labissière",8.01,4.46,0.99,0.41,0.6],["Spencer Hawes",10,6.1,2.2,0.4,1.2],["Thomas Robinson",4.8,4.7,0.7,0.5,0.4],["Toney Douglas",6.1,2.2,2.6,1.4,0],["Travis Outlaw",5.07,2.1,0.63,0.36,0.33],["Troy Williams",5.3,2.8,0.5,0.5,0.4],["Ty Lawson",9.9,2.6,4.8,1.1,0.1],["Tyreke Evans",17.16,4.73,4.73,1.4,0.44],["Vince Carter",5.4,2.6,1.2,0.7,0.4],["Willie Cauley-Stein",10.06,6.37,1.67,0.94,0.76],["Yogi Ferrell",5.9,1.5,1.9,0.5,0.1],["Zach Randolph",14.5,6.7,2.2,0.7,0.2]]],
    ["SAC","2020s",[["Russell Westbrook",15.2,5.4,6.7,1.3,0.2],["JaVale McGee",4,2.7,0.4,0.3,0.4],["DeMar DeRozan",20.3,3.4,4.2,0.9,0.3],["Hassan Whiteside",8.1,6,0.6,0.3,1.3],["Jonas Valančiūnas",10.4,7.7,2,0.5,0.6],["Harrison Barnes",14.9,4.9,2.2,0.7,0.2],["Jeremy Lamb",7.3,2.8,1.4,0.6,0.4],["Maurice Harkless",4.9,2.4,0.8,0.7,0.5],["Jae Crowder",2.6,2.2,0.7,0.3,0],["Justin Holiday",10.1,2.6,1.7,0.8,0.4],["Alex Len",3.4,3,0.9,0.2,0.6],["Matthew Dellavedova",1.5,0.4,1.3,0.2,0],["Zach LaVine",21.2,3.5,3.2,0.8,0.2],["Glenn Robinson III",5.3,2,0.9,0.2,0.1],["Doug McDermott",4.6,0.9,0.5,0.2,0.1],["Dario Saric",1,1.2,0.4,0,0],["Emmanuel Mudiay",1.5,0,2,0.5,0],["Delon Wright",10.2,4.3,4.4,1.6,0.5],["Richaun Holmes",9.2,5.7,1,0.4,0.9],["Trey Lyles",8,4.5,1.1,0.4,0.3],["Domantas Sabonis",18.5,12.7,6.2,0.9,0.4],["Buddy Hield",16.6,4.7,3.6,0.9,0.4],["Damian Jones",6.4,3.8,0.9,0.4,0.8],["Skal Labissiere",1.3,0.8,0.3,0,0],["Markelle Fultz",2.9,1,1.3,0.5,0.1],["Josh Jackson",6.4,2.8,1.1,0.5,0.4],["De'Aaron Fox",25,4,6.1,1.4,0.4],["Malik Monk",14.7,2.8,4.4,0.7,0.5],["PJ Dozier",1.4,0.9,0.6,0.4,0.1],["Sasha Vezenkov",5.4,2.3,0.5,0.5,0.2],["Marvin Bagley III",14.1,7.4,1,0.5,0.5],["Donte DiVincenzo",9,4,2.8,1.1,0.2],["Kevin Huerter",12.7,3.4,2.8,0.9,0.3],["Chimezie Metu",6.7,3.9,0.8,0.5,0.4],["Terence Davis",6.5,2.2,1.2,0.6,0.2],["Deonte Burton",0,0,0,0,0],["Drew Eubanks",5.2,3,0.5,0.4,0.6],["Juan Toscano-Anderson",0.6,1.3,0.4,0.1,0.1],["DaQuan Jeffries",10.3,1.7,0.3,0.7,0],["De'Andre Hunter",13.7,4.1,2,0.7,0.1],["KZ Okpala",1.3,1,0.4,0.2,0.2],["Kyle Guy",2.8,1.1,1,0.2,0],["Louis King",5.9,2.1,1.2,0.7,0.3],["Jalen McDaniels",0,0,0.3,0.3,0],["Jaylen Nowell",6.2,1.8,1.5,0.3,0.2],["Neemias Queta",2.7,2.2,0.3,0.1,0.5],["Justin James",3.9,0.8,0.6,0.2,0.1],["Chris Silva",2.1,1.8,0.4,0.1,0.4],["Killian Hayes",5.5,2.3,3.5,0.9,0.2],["Tyrese Haliburton",13,3,5.3,1.3,0.5],["Precious Achiuwa",10.1,6.7,1.4,0.9,0.7],["Jahmi'us Ramsey",3.2,0.8,0.5,0.2,0.1],["Robert Woodard II",1.5,1.2,0.2,0,0.2],["Mason Jones",1.8,0.9,1.1,0.1,0.1],["Jordan Ford",2,0.3,0.3,0,0],["Ade Murkey",0,0,0,0,0],["Chris Duarte",3.9,1.8,0.7,0.5,0.1],["Kessler Edwards",2.2,1.2,0.4,0.3,0.2],["Davion Mitchell",7.5,1.6,2.8,0.5,0.2],["Terry Taylor",0,0.3,0.7,0,0],["Keegan Murray",13.4,5.6,1.5,0.9,1],["Patrick Baldwin Jr.",3.7,2.6,0.6,0.3,0.6],["Keon Ellis",5.1,1.8,1.1,0.9,0.5],["Jake LaRavia",6.9,3.9,2.4,0.9,0.3],["Chima Moneke",1,1,0.5,0,0],["Daeqwon Plowden",10.8,3,1.3,0.7,0.2],["Colby Jones",2.1,1.3,0.7,0.2,0.2],["Jalen Slawson",0.7,0.6,0.2,0.1,0.1],["Isaiah Stevens",3.3,1,3.3,1.7,0],["Devin Carter",6.3,2.7,1.9,0.8,0.2],["Nique Clifford",8.6,3.8,2.4,0.9,0.3],["Isaiah Crawford",0.9,0.5,0.1,0.1,0.1],["Isaac Jones",3.4,1.4,0.3,0.1,0.3],["Maxime Raynaud",12.5,7.5,1.4,0.5,0.5],["Dylan Cardwell",5.4,7.5,1.4,0.7,1.5]]],
    ["SAS","1970s",[["Allan Bristow",8.71,3.54,2.79,0.9,0.06],["Billy Paultz",14.32,8.24,2.57,0.54,2.04],["Coby Dietrick",7.49,4.37,2.36,1,0.64],["Frankie Sanders",6,2.7,1.6,0.6,0.1],["George Gervin",26.61,5.2,3.1,1.57,1.23],["George Karl",2.55,0.68,1.56,0.3,0],["Glenn Mosley",3.3,2.5,0.7,0.3,0.4],["James Silas",11.72,1.72,2.64,0.75,0.19],["Larry Kenon",21.53,10.19,3.44,1.8,0.43],["Louie Dampier",6.67,1.15,2.78,0.75,0.17],["Mack Calvin",8.8,0.9,3,0.7,0],["Mark Olberding",9.35,5.2,1.93,0.67,0.3],["Mike Gale",9.14,2.92,5.26,2.16,0.51],["Mike Green",7.55,4.75,1.27,0.45,1.51],["Mo Layton",4.4,0.8,2.6,0.5,0.1]]],
    ["SAS","1980s",[["Albert King",7.1,3,1.7,0.6,0.2],["Alfredrick Hughes",5.2,1.7,0.9,0.4,0.1],["Alvin Robertson",16.16,5.37,5.39,2.9,0.52],["Anthony Jones",5.8,1.9,1.3,0.7,0.4],["Artis Gilmore",16.11,9.66,1.5,0.52,1.84],["Bill Willoughby",6.1,3.7,1.1,0.5,0.3],["Billy Knight",6,1.8,1.1,0.3,0],["Billy Paultz",8.65,6.53,2.25,0.96,0.99],["Dallas Comegys",6.5,3.5,0.4,0.6,0.9],["Darwin Cook",9.6,1.6,2.3,1.2,0.1],["Dave Corzine",10.3,7.75,1.5,0.45,1.35],["Dave Greenwood",9.27,8.06,2.08,0.73,0.64],["Ed Nealy",2.85,3.96,1.03,0.54,0.15],["Ed Rains",3.45,1.48,0.72,0.36,0],["Edgar Jones",9.64,5.38,0.93,0.69,1.21],["Frank Brickowski",14.38,6.42,2.83,1.32,0.49],["Fred Roberts",6.86,3.32,1.16,0.66,0.5],["Gene Banks",11.77,6.35,2.83,0.95,0.25],["George Gervin",27.73,4.57,2.84,1.09,0.75],["George Johnson",4.04,6.73,1.1,0.46,3.26],["Greg Anderson",12.7,7.25,0.85,0.95,1.4],["James Silas",17.7,2.64,4.15,0.75,0.2],["Jay Vincent",9,3.8,0.9,0.2,0.1],["Jeff Cook",3.38,3.32,0.66,0.46,0.3],["Jeff Lamp",11.1,2.6,1.8,0.6,0],["Jeff Wilkins",4.8,4.7,0.7,0.3,0.4],["Jerome Whitehead",3.2,2.5,0.3,0.4,0.1],["John Lambert",3.1,2.4,0.6,0.3,0.3],["John Lucas",10.9,2.9,10.7,1.5,0.1],["John Paxson",4.93,0.82,2.88,0.45,0],["John Shumate",11.36,6.15,1.54,0.94,0.79],["Johnny Dawkins",13.01,2.66,5.6,1.18,0],["Johnny Moore",10.26,3.21,8.11,2.13,0.25],["Jon Sundvold",8.94,1.12,3.8,0.5,0],["Keith Edmonson",8.7,1.8,0.7,0.6,0.2],["Kevin Restani",8.47,3.73,1.75,0.49,0.16],["Kurt Nimphius",4.4,2.1,0.7,0.3,0.8],["Larry Kenon",20.1,9.9,3,1.4,0.2],["Larry Krystkowiak",6.6,3.5,1.3,0.3,0.2],["Leon Wood",9.3,1.3,4.1,0.6,0],["Marc Iavaroni",5.77,4.08,1.7,0.5,0.47],["Mark McNamara",5.1,4.05,0.34,0.2,0.19],["Mark Olberding",12.19,5.91,3.61,0.87,0.37],["Michael Anderson",5.7,2.5,4.3,1.2,0.1],["Michael Wiley",5.7,1.9,0.3,0.2,0.2],["Mike Bratz",7.7,2,5.4,0.8,0.1],["Mike Brittain",1.67,1.37,0.22,0.12,0.34],["Mike Dunleavy",7.8,1.7,5.5,0.9,0.1],["Mike Evans",6.2,1.4,2.9,0.8,0.1],["Mike Gale",6.22,2.03,4.05,1.73,0.17],["Mike Mitchell",20.07,5.5,1.39,0.66,0.46],["Mike Sanders",7,3.6,0.7,0.7,0.2],["Mike Smrek",4.5,3,0.3,0.3,1.3],["Mychal Thompson",12.3,5.6,1.8,0.6,0.8],["Oliver Robinson",2.9,0.5,0.6,0.1,0.1],["Ozell Jones",3.7,3.6,0.8,0.4,0.9],["Paul Griffin",5.33,5.23,2.62,0.87,0.52],["Pete Myers",5.1,1.7,2.2,0.8,0.3],["Pétur Guðmundsson",5.6,4.6,1.19,0.29,0.85],["Ray Williams",7.1,1.6,4.8,1.2,0.1],["Reggie Johnson",10.26,4.92,1,0.54,0.64],["Roger Phegley",5.04,1.43,1.04,0.44,0.1],["Ron Brewer",10.41,1.33,1.75,0.59,0.39],["Scott Roth",3.4,1.2,1,0.4,0.1],["Steve Johnson",13.8,6.5,1.3,0.6,0.9],["Tyrone Corbin",7.23,3.05,1.95,1.03,0.1],["Vernon Maxwell",11.7,2.6,3.8,1.1,0.1],["Walter Berry",17.49,5.4,1.67,0.71,0.81],["Wes Matthews",10.9,1.7,6.3,1.2,0.4],["Wiley Peck",3.5,3.5,0.6,0.3,0.4],["Willie Anderson",18.6,5.1,4.6,1.9,0.8]]],
    ["SAS","1990s",[["Antoine Carr",10.81,4.25,0.96,0.42,1.09],["Antonio Daniels",4.7,1.1,2.3,0.6,0.1],["Avery Johnson",10.35,2.09,7.41,1.2,0.2],["Brad Lohaus",3.04,1.07,0.52,0.1,0.2],["Caldwell Jones",2.4,3.2,0.3,0.3,0.4],["Carl Herrera",4.81,2.88,0.53,0.49,0.41],["Charles Smith",7.74,5.22,0.95,0.89,1.01],["Chris Whitney",1.76,0.62,1.22,0.26,0],["Chuck Person",9.71,3.95,1.33,0.57,0.2],["Cory Alexander",5.14,1.19,2.52,0.77,0.11],["Dale Ellis",15.97,3.56,1.15,0.95,0.15],["Dave Greenwood",3.8,3.5,0.8,0.5,0.4],["David Robinson",24.4,11.51,2.96,1.56,3.38],["David Wingate",6.46,2.62,2.48,1.03,0.2],["David Wood",2.4,1.5,0.5,0.2,0.2],["Dennis Rodman",5.62,17.11,2.19,0.66,0.44],["Doc Rivers",4.43,1.76,2.03,0.94,0.34],["Dominique Wilkins",18.2,6.4,1.9,0.6,0.5],["Donald Royal",4.2,2.1,0.6,0.4,0.1],["Dwayne Schintzius",3.8,2.9,0.4,0,0.7],["Frank Brickowski",6.6,4.2,1.3,0.8,0.5],["Greg Anderson",2.93,4.31,0.33,0.58,0.69],["Greg Sutton",3.7,0.7,1.4,0.4,0.1],["J.R. Reid",8.27,4.49,0.77,0.63,0.39],["Jack Haley",2.26,0.9,0.05,0.05,0.11],["Jamie Feick",3.8,5.6,0.7,0.4,0.3],["Jaren Jackson",7.93,2.42,1.57,0.77,0.14],["Jerome Kersey",3.2,2.9,0.9,0.8,0.3],["Johnny Moore",2.2,1,1.5,0.6,0.1],["Larry Smith",1.3,4.1,0.4,0.3,0.2],["Lloyd Daniels",7.54,2.3,1.67,0.45,0.31],["Malik Rose",4.41,2.73,0.49,0.64,0.29],["Mario Elie",9.7,2.9,1.9,1,0.3],["Maurice Cheeks",10.9,3.3,6,1.6,0.1],["Monty Williams",7.06,2.67,1.17,0.59,0.49],["Negele Knight",9.3,1.6,3.1,0.5,0.2],["Paul Pressey",5.37,2.14,3.28,0.72,0.41],["Reggie Geary",2.5,1.1,1.2,0.6,0.2],["Reggie Williams",6.68,2.11,1.6,0.65,0.44],["Rod Strickland",13.88,4.22,8.23,2,0.24],["Sam Mack",3.6,1.2,0.4,0.4,0.1],["Sean Elliott",15.28,4.56,2.65,0.82,0.39],["Sean Higgins",4.29,1.3,0.7,0.21,0],["Sidney Green",5.36,4.5,0.7,0.43,0.15],["Sleepy Floyd",3.8,1.3,1.9,0.2,0.2],["Steve Kerr",4.4,1,1.1,0.5,0.1],["Terry Cummings",14.35,7,1.63,0.83,0.4],["Tim Duncan",21.33,11.71,2.59,0.78,2.5],["Tom Copa",1.5,1.1,0.1,0.1,0.2],["Tony Massenburg",2.29,1.65,0.1,0.1,0.29],["Trent Tucker",6.5,1.5,1.1,0.9,0.1],["Vernon Maxwell",10.47,2.48,2.46,1.08,0.22],["Vinnie Johnson",8,3,2.4,0.7,0.2],["Vinny Del Negro",11.17,2.65,3.62,0.79,0.08],["Will Perdue",5.61,6.89,0.55,0.37,0.9],["Willie Anderson",11.99,3.71,4.05,0.98,0.6]]],
    ["SAS","2000s",[["Amal McCaskill",1.9,1.3,0.1,0.2,0.4],["Antonio Daniels",8.38,1.86,3.09,0.73,0.13],["Avery Johnson",8.95,1.74,5.32,0.78,0.16],["Beno Udrih",5.27,1.04,1.78,0.41,0.04],["Brent Barry",7.23,2.13,1.88,0.56,0.24],["Bruce Bowen",6.44,2.95,1.28,0.82,0.37],["Charles Smith",7.4,2.2,1.3,0.9,0.7],["Charlie Ward",3.3,1.3,1.3,0.5,0.1],["Cherokee Parks",1.5,1.4,0.2,0.2,0.2],["Chucky Brown",6.3,2.6,1.4,0.3,0.3],["Damon Stoudamire",3.4,1.5,1.7,0.4,0.1],["Danny Ferry",4.12,2.01,0.73,0.28,0.21],["David Robinson",13.48,8.64,1.4,1.04,2.1],["Derek Anderson",15.5,4.4,3.7,1.5,0.2],["Derrick Dial",3.07,1.61,0.6,0.1,0.18],["Devin Brown",5.6,2.34,0.99,0.44,0.15],["Fabricio Oberto",3.58,3.88,0.94,0.3,0.23],["Felton Spencer",1.9,1.5,0.1,0.2,0.3],["Francisco Elson",4.45,4.25,0.65,0.33,0.62],["George Hill",5.7,2.1,1.8,0.6,0.3],["Hedo Türkoğlu",9.2,4.5,1.9,1,0.4],["Ime Udoka",5.08,2.96,0.85,0.66,0.2],["Ira Newble",2,1.3,0.2,0.1,0.1],["Jacque Vaughn",3.34,0.98,2.01,0.32,0],["Jaren Jackson",5.66,1.97,1.32,0.63,0.08],["Jason Hart",3.19,1.47,1.45,0.53,0.1],["Jerome Kersey",4.5,3.1,1,0.9,0.7],["Kevin Willis",3.88,2.72,0.26,0.34,0.26],["Kurt Thomas",4.35,5.05,0.72,0.5,0.65],["Malik Rose",8.24,5.34,0.93,0.7,0.51],["Manu Ginóbili",14.72,4.06,3.57,1.56,0.34],["Mario Elie",7.5,3.2,2.4,0.9,0.1],["Mark Bryant",1.9,1.5,0.3,0.2,0.1],["Matt Bonner",6.17,3.59,0.67,0.39,0.27],["Michael Finley",9.72,3.07,1.4,0.45,0.15],["Mike Wilks",1.7,0.5,0.7,0.3,0],["Nazr Mohammed",6.2,5.47,0.46,0.28,0.78],["Nick Van Exel",5.5,1.4,1.9,0.2,0],["Rasho Nesterović",6.41,6.06,0.93,0.44,1.6],["Robert Horry",4.63,3.39,1.15,0.69,0.66],["Roger Mason",11.8,3.1,2.1,0.5,0.1],["Ron Mercer",5,1.3,0.6,0.4,0.1],["Samaki Walker",5.19,3.89,0.5,0.15,0.59],["Sean Elliott",7.39,3.09,1.57,0.45,0.39],["Sean Marks",3.25,2.04,0.3,0.15,0.4],["Shawnelle Scott",1.6,1.9,0.1,0.2,0.2],["Speedy Claxton",5.8,1.9,2.5,0.7,0.2],["Stephen Jackson",10.04,3.04,1.9,1.4,0.33],["Steve Kerr",3.53,0.69,0.84,0.31,0],["Steve Smith",9.64,2.26,1.71,0.62,0.2],["Terry Porter",7.32,2.53,3.06,0.67,0.13],["Tim Duncan",21.43,11.74,3.26,0.77,2.32],["Tony Massenburg",3.2,2.7,0.2,0.3,0.3],["Tony Parker",16.72,3.11,5.66,0.99,0.09]]],
    ["SAS","2010s",[["Antonio McDyess",5.56,5.66,1.15,0.55,0.45],["Aron Baynes",4.78,3.53,0.52,0.11,0.24],["Austin Daye",4.03,1.98,0.34,0.3,0.17],["Boban Marjanović",5.5,3.6,0.4,0.2,0.4],["Boris Diaw",7.37,3.77,2.59,0.51,0.35],["Brandon Paul",2.3,1.1,0.6,0.4,0.1],["Bryn Forbes",8.15,1.88,1.38,0.37,0],["Chimezie Metu",1.8,1.2,0.4,0.2,0.1],["Chris Quinn",2,0.6,1,0.1,0],["Cory Joseph",5.2,1.85,1.93,0.5,0.17],["Danny Green",9.07,3.54,1.68,1.02,0.86],["Dante Cunningham",3,2.9,0.8,0.4,0.2],["David Lee",7.3,5.6,1.6,0.4,0.5],["David West",7.1,4,1.8,0.6,0.7],["DeJuan Blair",7.81,5.82,0.92,0.84,0.37],["DeMar DeRozan",21.2,6,6.2,1.1,0.5],["Dejounte Murray",6.6,4.23,2.39,0.88,0.34],["Derrick White",8.54,3.25,3.21,0.84,0.6],["Dewayne Dedmon",5.1,6.5,0.6,0.5,0.8],["Drew Eubanks",1.8,1.5,0.3,0.1,0.2],["Dāvis Bertāns",6.2,2.37,1.01,0.37,0.4],["Gary Neal",9.73,2.26,1.68,0.39,0.04],["George Hill",12.01,2.6,2.7,0.9,0.3],["Ian Mahinmi",3.9,2,0.1,0.1,0.3],["Ime Udoka",0.7,1,0.7,0.4,0.1],["Jakob Poeltl",5.5,5.3,1.2,0.4,0.9],["James Anderson",3.64,1.31,0.78,0.18,0.08],["Jeff Ayres",3.05,3.01,0.59,0.2,0.26],["Joffrey Lauvergne",4.1,3.1,0.7,0.2,0.1],["Jonathon Simmons",6.12,1.93,1.39,0.52,0.22],["Kawhi Leonard",16.35,6.16,2.27,1.77,0.73],["Keith Bogans",4.4,2.2,1.2,0.6,0.2],["Kyle Anderson",4.88,3.59,1.73,0.96,0.49],["LaMarcus Aldridge",19.98,8.4,1.96,0.55,1.2],["Malik Hairston",2.1,1,0.3,0.1,0.2],["Manu Ginóbili",12.09,3.04,3.97,1.13,0.28],["Marco Belinelli",10.46,2.61,1.82,0.5,0.07],["Matt Bonner",5.12,2.5,0.72,0.28,0.26],["Michael Finley",3.7,1.5,0.8,0.2,0.2],["Nando De Colo",3.93,1.85,1.71,0.6,0.1],["Patty Mills",8.89,1.83,2.48,0.66,0.08],["Pau Gasol",10.03,7.39,2.6,0.32,0.96],["Quincy Pondexter",1.8,0.9,0.5,0.2,0],["Rasual Butler",2.7,1.2,0.5,0.3,0.5],["Ray McCallum",2.2,1,1.1,0.2,0.1],["Reggie Williams",1.9,0.9,0.5,0.1,0],["Richard Jefferson",11.16,3.98,1.58,0.56,0.42],["Roger Mason",6.3,2.1,1.7,0.4,0.2],["Rudy Gay",12.7,6.03,2.01,0.8,0.59],["Stephen Jackson",6.95,3.1,1.64,0.87,0.3],["Steve Novak",4,1,0.1,0,0.2],["Theo Ratliff",1.6,1.9,0.4,0.1,0.9],["Tiago Splitter",8.26,5.29,1.24,0.59,0.63],["Tim Duncan",14.7,9.19,2.82,0.7,1.84],["Tony Parker",14.9,2.41,5.76,0.73,0.07]]],
    ["SAS","2020s",[["Chris Paul",8.8,3.6,7.4,1.3,0.3],["Rudy Gay",11.4,4.8,1.4,0.7,0.6],["DeMar DeRozan",21.6,4.2,6.9,0.9,0.2],["Patty Mills",10.8,1.7,2.4,0.6,0],["Bismack Biyombo",3,3.3,0.7,0.4,0.5],["Harrison Barnes",11.1,3.3,1.8,0.6,0.2],["Gorgui Dieng",5.3,3.6,1.5,0.4,0.5],["Kelly Olynyk",3.2,1.8,1.2,0.4,0.1],["Mason Plumlee",1.6,2.7,1,0.5,0],["Khem Birch",2.2,1.3,0.4,0.3,0.3],["Doug McDermott",10.8,2.2,1.4,0.2,0.1],["Tyler Johnson",2.8,2,1.2,0.5,0.5],["Trey Lyles",5,3.7,0.6,0.3,0],["Josh Richardson",10.2,2.8,1.8,0.9,0.4],["Cedi Osman",6.8,2.5,1.7,0.5,0.2],["Dejounte Murray",18.4,7.7,7.3,1.8,0.2],["Jakob Poeltl",11.1,8.6,2.3,0.7,1.8],["De'Aaron Fox",21.1,4.3,6.2,1.4,0.3],["Zach Collins",10.2,5.8,2.6,0.5,0.8],["Derrick White",15.4,3,3.5,0.7,1],["Luke Kornet",6.5,6.1,1.9,0.5,1],["Jaylen Morris",0.7,0.7,0.7,0,0],["Keita Bates-Diop",6,3.1,0.9,0.5,0.2],["Devonte' Graham",6.2,1.6,2.4,0.5,0.2],["Alize Johnson",1.8,2.5,0.3,0.3,0],["Lonnie Walker IV",11.6,2.6,2,0.6,0.3],["Jock Landale",4.9,2.6,0.8,0.2,0.3],["Jordan McLaughlin",2,0.7,1,0.4,0],["Drew Eubanks",5.8,4.5,0.8,0.3,0.9],["DaQuan Jeffries",4.1,2.3,0.7,0.5,0.3],["Keldon Johnson",15.6,5.5,2.1,0.7,0.2],["Romeo Langford",5.7,2.5,0.8,0.6,0.3],["Charles Bassey",4.5,4.6,1,0.4,0.9],["Luka Samanic",3.7,2.1,0.5,0.2,0.2],["Quinndary Weatherspoon",2.3,0.6,0.4,0.4,0.1],["Devontae Cacok",3.1,2.8,0.4,0.5,0.5],["Devin Vassell",14.3,3.8,2.6,1,0.4],["Tre Jones",7.8,2.5,4.3,0.8,0.1],["Malachi Flynn",4,1.8,1.8,0.8,0],["Robert Woodard II",0.6,0.9,0.3,0.1,0.1],["Lindy Waters III",2.4,0.7,0.5,0.2,0],["David Duke Jr.",4.6,1.6,1,0.3,0],["Joshua Primo",6.4,2.8,3,0.3,0.5],["RaiQuan Gray",7.7,2.3,2,0.3,0.3],["Sandro Mamukelashvili",5.5,3.5,1.1,0.3,0.3],["Julian Champagnie",9.4,4,1.2,0.6,0.5],["Joe Wieskamp",2.1,0.5,0.3,0.1,0.1],["Stanley Umude",1,0,0.5,0.5,0],["Malaki Branham",8.1,1.9,1.6,0.4,0.1],["Blake Wesley",4.4,1.6,2.4,0.6,0.1],["Jeremy Sochan",11.3,6.1,2.8,0.8,0.5],["Jamaree Bouyea",2.3,2.1,1.2,0.1,0],["Harrison Ingram",1.2,1.1,0.3,0.3,0],["Jordan Hall",3.1,1.3,1.2,0.1,0],["Dominick Barlow",4.2,3.5,1,0.4,0.6],["Sidy Cissoko",3.8,1.8,0.8,0.6,0.3],["Victor Wembanyama",23.6,11,3.6,1.1,3.5],["Emanuel Miller",3,0.6,0.8,0.4,0],["Stephon Castle",15.7,4.5,5.8,1,0.3],["David Jones Garcia",2.9,1.2,1.6,0.5,0.1],["Riley Minix",0,2,0,0,0],["Dylan Harper",11.8,3.4,3.9,0.8,0.3],["Carter Bryant",4.2,2.5,0.7,0.2,0.3]]],
    ["TOR","1990s",[["Acie Earl",5.98,2.67,0.55,0.35,0.8],["Alvin Robertson",9.3,4.4,4.2,2.2,0.5],["Alvin Williams",4.63,1.6,2.37,0.92,0.18],["Carlos Rogers",8.37,4.12,0.68,0.59,0.96],["Charles Oakley",7,7.5,3.4,0.9,0.4],["Chauncey Billups",11.3,2.7,3.3,1,0.1],["Chris Garner",1.4,0.6,1.2,0.6,0.1],["Clifford Rozier",4.6,5.7,0.8,0.6,1.1],["Damon Stoudamire",19.58,4.14,8.8,1.49,0.21],["Dee Brown",11.59,2.41,3.06,1.14,0.32],["Donald Whiteside",2.2,0.4,1.3,0.4,0],["Doug Christie",14.71,4.82,3.63,2.33,0.6],["Ed Pinckney",7,6,1.1,0.7,0.4],["Hubert Davis",5,1.1,0.9,0.3,0.1],["Jimmy King",4.5,1.8,1.4,0.3,0.2],["John Long",4,1.3,0.7,0.3,0.1],["John Salley",6,3.9,1.6,0.4,0.5],["John Thomas",3.49,2.8,0.33,0.3,0.16],["John Wallace",12.01,4.17,1.19,0.62,1.09],["Kevin Willis",12,8.3,1.6,0.7,0.7],["Marcus Camby",13.45,6.85,1.65,1.05,2.9],["Michael Stewart",1.5,2.4,0.1,0.1,0.7],["Oliver Miller",9.42,6.53,2.81,1.12,1.43],["Popeye Jones",7.92,8.4,1.13,0.7,0.45],["Reggie Slater",7.02,3.5,0.72,0.43,0.29],["Sharone Wright",7.53,3.23,0.58,0.3,0.74],["Shawn Respert",5.54,1.45,1.01,0.64,0.04],["Tony Massenburg",10.1,6.9,0.8,0.5,0.4],["Tracy McGrady",8,4.85,1.85,0.93,1.13],["Tracy Murray",16.2,4.3,1.6,1.1,0.5],["Vince Carter",18.3,5.7,3,1.1,1.5],["Vincenzo Esposito",3.9,0.5,0.8,0.2,0],["Walt Williams",15.29,4.78,2.64,1.33,0.8],["Willie Anderson",12.4,3.8,3,1.2,1],["Žan Tabak",7.14,4.4,0.92,0.41,0.6]]],
    ["TOR","2000s",[["Aaron Williams",1.68,1.22,0.1,0.11,0.14],["Alvin Williams",10.13,2.74,4.64,1.28,0.27],["Andrea Bargnani",12.45,4.32,1.05,0.39,0.84],["Anthony Parker",11.86,4,2.58,1.1,0.2],["Antonio Davis",12.89,9.15,1.67,0.48,1.31],["Carlos Delfino",9,4.4,1.8,0.8,0.1],["Charles Oakley",8.23,8.13,3.3,1.15,0.6],["Charlie Villanueva",13,6.4,1.1,0.7,0.8],["Chris Bosh",19.59,9.14,2.16,0.8,1.21],["Chris Childs",4.21,2.28,4.96,0.8,0.15],["Chris Jefferies",3.9,1.17,0.4,0.38,0.29],["Corliss Williamson",9.3,3.6,0.8,0.4,0.3],["Darrick Martin",2.55,0.45,1.36,0.29,0],["Dee Brown",6.9,1.4,2.3,0.6,0.1],["Dell Curry",6.67,1.36,1.17,0.43,0.1],["Donyell Marshall",13.87,8.67,1.3,1.05,1.15],["Doug Christie",12.4,3.9,4.4,1.4,0.6],["Eric Montross",2.14,2.8,0.3,0.22,0.46],["Eric Williams",4.07,2.07,1.05,0.46,0.1],["Fred Jones",7.6,2.1,1.4,0.8,0.3],["Greg Foster",4.2,3.5,0.4,0,0.3],["Hakeem Olajuwon",7.1,6,1.1,1.2,1.5],["Jake Voskuhl",0.9,1.6,0.2,0.1,0.1],["Jalen Rose",16.19,3.41,3.39,0.7,0.21],["Jamario Moon",8.01,5.55,1.24,1.08,1.15],["Jason Kapono",7.7,1.75,1.05,0.35,0],["Jelani McCoy",6.8,5.3,0.6,0.4,0.9],["Jermaine Jackson",2.6,1.05,2,0.4,0.05],["Jermaine O'Neal",13.5,7,1.6,0.4,2],["Jerome Williams",7.84,7.07,1.06,1.26,0.38],["Joey Graham",6.47,3.09,0.63,0.39,0.14],["John Thomas",2.1,1.4,0.2,0.2,0.3],["Jorge Garbajosa",7.99,4.64,1.76,1.12,0.18],["José Calderón",9.66,2.43,6.73,0.93,0.1],["Juan Dixon",7.15,1.93,1.72,0.77,0.1],["Jérôme Moïso",2.7,3.14,0.16,0.46,0.32],["Keon Clark",10.47,6.68,0.99,0.56,1.83],["Kevin Willis",7.97,6.19,0.6,0.5,0.6],["Kris Humphries",4.65,3.24,0.34,0.31,0.36],["Lamond Murray",6,2.63,0.8,0.5,0.27],["Lindsey Hunter",9.7,2,2.4,1.2,0.2],["Lonny Baxter",4.2,3.4,0.3,0.4,0.5],["Loren Woods",3.3,4.6,0.29,0.24,0.9],["Maceo Baston",2.6,1.55,0.1,0.2,0.51],["Mamadou N'Diaye",4.83,3.15,0.22,0.29,1.17],["Mark Jackson",8.5,3.4,9.2,1.2,0.1],["Matt Bonner",7.35,3.55,0.65,0.55,0.3],["Michael Bradley",3.77,4.52,0.72,0.15,0.39],["Michael Curry",2.9,1.2,0.8,0.3,0.1],["Michael Stewart",1.45,1.85,0.13,0.17,0.34],["Mike James",20.3,3.3,5.8,0.9,0],["Milt Palacio",5.21,1.7,3.33,0.64,0.2],["Morris Peterson",11.99,3.78,1.79,1.03,0.25],["Muggsy Bogues",4.92,1.67,3.63,0.8,0.1],["Pape Sow",2.88,2.83,0.17,0.43,0.32],["Rafael Araújo",2.83,2.96,0.3,0.45,0.1],["Rafer Alston",11.83,3.06,5.55,1.24,0.17],["Rasho Nesterović",6.95,4.64,1.04,0.41,0.91],["Robert Archibald",1,1.7,0.4,0.4,0.1],["Roger Mason",4,1.2,1,0.4,0.3],["Roko Ukić",4.2,1,2.1,0.4,0],["Shawn Marion",14.3,8.3,2.3,1.1,0.8],["T.J. Ford",13.23,2.65,7.17,1.22,0.06],["Tracy McGrady",15.4,6.3,3.3,1.1,1.9],["Tracy Murray",5.55,1.45,0.45,0.25,0.2],["Vince Carter",24.1,5.12,3.98,1.35,0.96],["Voshon Lenard",14.3,3.4,2.3,0.9,0.3],["Will Solomon",4.9,1.1,3.2,0.5,0.1]]],
    ["TOR","2010s",[["Aaron Gray",3.3,4.44,0.7,0.29,0.2],["Alan Anderson",10.47,2.24,1.58,0.62,0.12],["Alexis Ajinça",4.8,2.5,0.3,0.3,0.6],["Amir Johnson",8.79,6.29,1.25,0.67,1.07],["Andrea Bargnani",18.1,5.37,1.49,0.46,0.93],["Anthony Carter",2,1.4,1.4,0.3,0.2],["Antoine Wright",6.5,2.8,1.1,0.4,0.2],["Bismack Biyombo",5.5,8,0.4,0.2,1.6],["Bruno Caboclo",1.11,0.6,0.23,0.18,0.12],["C.J. Miles",8.36,2.02,0.73,0.5,0.3],["Chris Bosh",24,10.8,2.4,0.6,1],["Chris Boucher",3.3,2,0.1,0.2,0.9],["Chuck Hayes",2,2.89,0.64,0.42,0.16],["Cory Joseph",8.9,2.75,3.2,0.8,0.25],["Danny Green",10.3,4,1.6,0.9,0.7],["DeMar DeRozan",19.71,4.04,3.07,0.98,0.29],["DeMarre Carroll",9.46,4.04,1,1.26,0.35],["Delon Wright",6.65,2.41,2.29,0.86,0.36],["Ed Davis",7.69,6.81,0.87,0.6,0.95],["Fred VanVleet",8.28,2.2,3.3,0.8,0.26],["Gary Forbes",6.6,2.1,1.1,0.5,0.1],["Greg Monroe",4.8,4.1,0.4,0.3,0.2],["Greivis Vásquez",9.5,2.47,3.7,0.51,0.1],["Hedo Türkoğlu",11.3,4.6,4.1,0.7,0.4],["Jakob Poeltl",5.39,4.12,0.5,0.42,0.88],["Jamaal Magloire",1.2,3.3,0.2,0.1,0.3],["James Johnson",7.63,3.71,1.71,0.83,1.02],["Jarrett Jack",11.32,2.77,4.93,0.75,0.09],["Jeremy Lin",7,2.6,2.2,0.4,0.3],["Jerryd Bayless",10.48,2.36,3.93,0.67,0.1],["Joey Dorsey",3.1,4.4,0.6,0.6,0.4],["John Lucas III",5.3,1,1.7,0.4,0],["John Salmons",5,2,1.7,0.6,0.2],["Jonas Valančiūnas",11.74,8.44,0.75,0.39,1.03],["José Calderón",10.35,2.62,7.72,0.87,0.1],["Julian Wright",3.6,2.3,1.1,0.8,0.4],["Julyan Stone",0.9,1,0.6,0.1,0],["Kawhi Leonard",26.6,7.3,3.3,1.8,0.4],["Kyle Lowry",17.33,4.87,7.07,1.52,0.31],["Landry Fields",3.32,2.76,0.91,0.47,0.12],["Leandro Barbosa",12.84,1.78,1.85,0.9,0.14],["Linas Kleiza",9.82,3.97,0.92,0.44,0.14],["Lorenzo Brown",2.17,1.16,1.03,0.46,0.13],["Lou Williams",15.5,1.9,2.1,1.1,0.1],["Lucas Nogueira",3.14,2.77,0.47,0.63,1.04],["Luis Scola",8.7,4.7,0.9,0.6,0.4],["Malachi Richardson",1.43,0.62,0,0,0],["Malcolm Miller",2.9,0.8,0.16,0.1,0.1],["Marc Gasol",9.1,6.6,3.9,0.9,0.9],["Marco Belinelli",7.1,1.4,1.3,0.6,0.1],["Marcus Banks",4.64,0.92,1.18,0.48,0.09],["Nando De Colo",3.1,1.3,1.6,0.3,0.1],["Norman Powell",7.11,2.11,1.23,0.63,0.2],["OG Anunoby",6.42,2.69,0.7,0.7,0.25],["P.J. Tucker",5.8,5.4,1.1,1.3,0.2],["Pascal Siakam",10.07,5.11,1.97,0.76,0.65],["Patrick McCaw",2.7,1.7,1,0.8,0.1],["Patrick Patterson",7.59,4.78,1.43,0.71,0.48],["Quincy Acy",3.75,2.58,0.44,0.44,0.48],["Rasho Nesterović",3.9,2.1,0.6,0.2,0.4],["Rasual Butler",3.2,1.9,0.6,0.2,0.1],["Reggie Evans",3.92,7.78,0.82,0.76,0.15],["Rudy Gay",19.46,6.75,2.59,1.66,0.91],["Serge Ibaka",13.84,7.14,1,0.39,1.36],["Sonny Weems",8.28,2.71,1.64,0.6,0.22],["Steve Novak",3.3,1.1,0.2,0.2,0.1],["Terrence Ross",9.47,2.62,0.87,0.72,0.29],["Tyler Hansbrough",4.2,4.02,0.3,0.4,0.25]]],
    ["TOR","2020s",[["Kyle Lowry",17.2,5.4,7.3,1,0.3],["Thaddeus Young",5.3,3.5,1.7,1,0.2],["Garrett Temple",2,1,0.8,0.4,0.1],["Will Barton",6.8,2.4,2,0.5,0.2],["Aron Baynes",6.1,5.2,0.9,0.3,0.4],["Kelly Olynyk",9.8,5.3,4.4,0.9,0.4],["Otto Porter Jr.",4,2.1,0.8,0.8,0.1],["Rodney Hood",4.5,1.9,1,0.4,0.1],["Khem Birch",5.8,5,1.1,0.6,0.6],["Sam Dekker",0,0,0,0,0],["Stanley Johnson",4.4,2.5,1.5,0.9,0.3],["Henry Ellenson",7.5,6,2.5,0,0],["Brandon Ingram",21.9,5.6,4.5,0.9,0.6],["Jakob Poeltl",12.2,8.6,2.5,0.9,1.1],["DeAndre' Bembry",5.7,2.9,2.1,1,0.4],["Patrick McCaw",1,0.6,0.8,0.4,0],["Pascal Siakam",22.8,7.8,5.2,1.1,0.6],["Juancho Hernangomez",2.9,2.9,0.6,0.4,0.1],["Fred VanVleet",19.7,4.2,6.7,1.7,0.6],["Markelle Fultz",0.8,0.2,1.6,0.4,0],["OG Anunoby",16.6,5.3,2.3,1.6,0.6],["D.J. Wilson",7.5,4,1.3,1.3,0.3],["Kobi Simmons",5,1.8,3,1.5,0.5],["Chris Boucher",9.8,5.4,0.6,0.5,0.9],["Paul Watson",4.1,1.7,0.6,0.2,0.1],["Bruce Brown",10.8,4.2,2.9,0.9,0.3],["Bruno Fernando",3.4,3,1.1,0.2,0.5],["Svi Mykhailiuk",4.6,1.6,0.8,0.5,0.1],["Gary Trent Jr.",16.2,2.6,1.7,1.4,0.2],["Isaac Bonga",0.8,0.5,0.3,0.5,0.1],["Yuta Watanabe",4.3,2.8,0.7,0.4,0.4],["RJ Barrett",20.2,5.7,4,0.7,0.3],["Jalen McDaniels",3.4,1.6,0.7,0.4,0.1],["Jordan Nwora",7,2.9,1.2,0.5,0.3],["Armoni Brooks",5.3,1.9,1.1,0.5,0.2],["Precious Achiuwa",9.1,6.2,1,0.6,0.6],["Jahmi'us Ramsey",6.7,3.1,1.1,1,0],["Daniel Oturu",3,1.7,0,0,0.7],["Immanuel Quickley",16.8,3.8,5.5,0.9,0.1],["Malachi Flynn",5.5,1.8,1.9,0.6,0.1],["Jalen Harris",7.4,1.4,1.3,0.6,0],["Freddie Gillespie",5.6,4.9,0.5,0.7,1],["Jeff Dowtin Jr.",2.4,0.9,1.2,0.4,0.1],["David Johnson",0,0,0,0,0],["Ochai Agbaji",8.1,3.3,1.3,0.8,0.6],["Justin Champagnie",2.3,2,0.3,0.2,0.1],["Scottie Barnes",17.6,7.5,5.2,1.3,1.1],["Sandro Mamukelashvili",11.2,4.9,1.9,0.8,0.5],["Joe Wieskamp",1,0.4,0.3,0,0],["D.J. Carton",1.8,1,0.8,0.4,0],["Dalano Banton",3.9,1.7,1.4,0.4,0.3],["A.J. Lawson",6.7,2.5,0.8,0.5,0.2],["Colin Castleton",4.7,4.7,1.1,0.3,0.4],["Orlando Robinson",6.9,5,1.8,0.4,0.4],["Christian Koloko",3.1,2.9,0.5,0.4,1],["Jared Rhoden",8.4,3,1.1,0.7,0.1],["Ron Harper Jr.",1.1,0.4,0.7,0,0.1],["Trayce Jackson-Davis",3.4,2.7,0.7,0.3,0.5],["Javon Freeman-Liberty",7,3.2,1.8,0.5,0.2],["Mouhamadou Gueye",2.4,2.1,0.5,0.3,1.6],["Gradey Dick",9.6,2.6,1.2,0.7,0.1],["Markquis Nowell",2,2,2,1,0],["Malik Williams",2.7,5.4,0.3,0.4,0.6],["Ja'Kobe Walter",8.1,2.9,1.4,0.9,0.2],["Ulrich Chomche",0.7,1.1,0.3,0,0.1],["Jamal Shead",6.8,1.6,4.8,0.9,0.2],["Jonathan Mogbo",3.9,3.3,1.4,0.6,0.3],["Jamison Battle",5.1,2.1,0.7,0.2,0.1],["Collin Murray-Boyles",8.5,5,1.9,0.9,0.9],["Alijah Martin",2.2,0.9,0.5,0.3,0.2],["Chucky Hepburn",0,0.5,1,0.5,0]]],
    ["UTA","1970s",[["Aaron James",10.78,4.13,1.06,0.44,0.21],["Andy Walker",4.5,1.9,0.8,0.5,0.2],["Bernie Fryer",4.1,1.5,1.7,0.7,0],["Bud Stallworth",8.88,2.76,0.7,0.63,0.26],["E.C. Coleman",8.03,6.86,1.33,0.9,0.43],["Fred Saunders",5,2.5,1.2,0.5,0.3],["Freddie Boyd",7.54,1.41,2.78,0.79,0.13],["Gail Goodrich",14.2,2.34,4.49,1.05,0.23],["Gus Bailey",3.15,1.67,0.81,0.38,0.29],["Henry Bibby",9.2,2.17,2.77,0.83,0],["Ira Terrell",4.9,3.5,0.8,0.5,0.7],["James Hardy",6.7,4.6,1,0.8,0.9],["Jim Barnett",13,2.8,3,0.8,0.4],["Jim McElroy",11.51,2.37,4,1.13,0.35],["Joe Meriweather",7.72,6.18,1.02,0.38,1.76],["Louie Nelson",11.82,2.89,2.55,1.04,0.1],["Marty Byrnes",5.3,2.6,1.2,0.3,0.2],["Mel Counts",5.79,5.16,2.09,0.64,0.51],["Mo Howard",5.7,1.5,1.6,0.7,0.3],["Nate Williams",12.25,4.1,1.36,1.13,0.22],["Neal Walk",9.9,7.1,2.7,0.8,0.5],["Ollie Johnson",7.9,4.1,1.9,1,0.5],["Otto Moore",7.36,8.72,2.38,0.78,1.44],["Paul Griffin",4.82,5.81,2,0.8,0.5],["Pete Maravich",25.66,4.44,5.75,1.44,0.29],["Rich Kelley",10.04,9.25,2.81,1.01,1.34],["Rick Adelman",6.3,2,2.5,1.7,0.2],["Ron Behagen",10.12,7.83,1.77,0.86,0.35],["Slick Watts",7.2,2.5,4.1,1.4,0.4],["Spencer Haywood",24,9.6,2.1,0.9,1.6],["Tommie Green",3.9,1.2,2.4,1,0.1],["Truck Robinson",23.22,14.91,1.96,0.83,1.17]]],
    ["UTA","1980s",[["Adrian Dantley",29.58,6.18,3.69,1.09,0.14],["Allan Bristow",10.15,5.7,4.45,0.95,0.05],["Bart Kofoed",1.4,0.47,0.77,0.3,0],["Ben Poquette",8.96,6.59,1.71,0.7,1.6],["Bill Robinzine",5.8,2.6,0.9,0.7,0.1],["Billy McKinney",8.4,2.1,4.5,1.1,0.1],["Billy Paultz",1.3,1.5,0.3,0.1,0.2],["Bob Hansen",7.53,2.26,1.66,0.67,0.09],["Bobby Cattage",3.1,1.5,0.1,0.1,0],["Carey Scurry",4.83,2.97,1.08,1.02,0.8],["Carl Nicks",7.03,1.83,1.3,0.8,0.07],["Danny Schayes",9.6,6.64,2.37,0.68,1.09],["Darrell Griffith",18.46,3.71,2.52,1.35,0.36],["Dell Curry",4.9,1.2,0.9,0.4,0.1],["Duck Williams",6.6,1.4,2.4,1.3,0.1],["Eric Leckner",4.3,2.7,0.2,0.1,0.3],["Fred Roberts",6.06,2.11,0.88,0.19,0.15],["Howard Wood",3.4,1.5,0.2,0.2,0.1],["J.J. Anderson",5.09,2.96,0.79,0.75,0.27],["James Hardy",5.26,5.54,1.38,0.68,0.94],["Jeff Judkins",3.8,1.5,1,0.3,0],["Jeff Wilkins",8.06,5.74,1.03,0.39,0.53],["Jerome Whitehead",2.1,3,0.6,0.2,0.3],["Jerry Eaves",6.93,1.3,2.55,0.5,0.05],["Jim Farmer",4.1,1.5,0.8,0.2,0],["Jim Les",1.7,1.1,2.6,0.3,0.1],["John Drew",18.57,4.55,1.87,1.02,0.07],["John Duren",2.86,1.03,1.8,0.37,0.1],["John Stockton",10.6,2.24,9.62,2.32,0.16],["José Ortiz",2.8,1.1,0.2,0.2,0.1],["Karl Malone",23.34,10.5,2.47,1.45,0.67],["Kelly Tripucka",9.1,2.83,2.72,0.95,0.1],["Kenny Natt",3.53,0.92,1.1,0.22,0],["Kent Benson",4.5,3.2,0.5,0.5,0.4],["Mack Calvin",6.4,1.8,2.8,0.6,0],["Marc Iavaroni",3.54,2.47,0.62,0.22,0.19],["Mark Eaton",7,8.65,1.23,0.41,4.21],["Mel Bennett",3.8,3.3,0.5,0.1,0.4],["Melvin Turpin",5.9,3,0.4,0.3,0.9],["Mike Brown",4.5,3.9,0.6,0.4,0.3],["Pace Mannion",3.6,1.14,0.93,0.56,0.1],["Paul Dawkins",5.5,2.2,1.4,0.6,0.2],["Rich Kelley",4.96,5.8,1.96,0.67,0.45],["Rickey Green",11.42,2.29,6.86,1.82,0.07],["Rickey Williams",3.3,0.9,0.8,0.5,0.1],["Ron Boone",10.81,2.37,3.63,0.95,0.08],["Scott Roth",2.51,0.87,0.52,0.42,0.04],["Steve Hayes",1.5,1.3,0.1,0.1,0.3],["Terry Furlow",16,2.8,4,1,0.3],["Thurl Bailey",15.22,5.93,1.68,0.55,1.32],["Tom Boswell",7.82,3.98,1.32,0.32,0.31],["Wayne Cooper",6.9,6.2,0.7,0.3,0.7]]],
    ["UTA","1990s",[["Adam Keefe",5.81,4.6,0.7,0.56,0.33],["Andy Toolson",2.64,1.2,0.57,0.24,0],["Antoine Carr",7.57,2.59,0.86,0.3,0.83],["Blue Edwards",9.83,3.13,1.61,0.9,0.46],["Bob Hansen",7.6,2.8,1.8,0.6,0.1],["Bryon Russell",7.52,3.32,1.02,1.1,0.28],["Chris Morris",6.42,2.62,0.75,0.63,0.3],["Corey Crowder",2.2,0.8,0.3,0.1,0],["Dan O'Sullivan",1,0.8,0.2,0,0],["Darrell Griffith",7.37,1.62,0.66,0.7,0.15],["David Benoit",7.8,4.63,0.63,0.44,0.61],["Delaney Rudd",3.54,0.77,2.24,0.31,0],["Eric Johnson",1.1,0.6,1.3,0.4,0],["Eric Leckner",4.3,2.5,0.2,0.2,0.3],["Eric Murdock",4.1,1.1,1.8,0.6,0.1],["Felton Spencer",7.57,6.63,0.38,0.4,0.82],["Greg Foster",4.1,2.65,0.49,0.13,0.31],["Greg Ostertag",5.46,5.96,0.35,0.28,1.95],["Howard Eisley",5.94,1.5,3.12,0.55,0.09],["Isaac Austin",2.48,1.46,0.14,0.16,0.22],["Jacque Vaughn",2.86,0.74,1.51,0.23,0],["James Donaldson",2.71,2.78,0.29,0.11,0.76],["Jamie Watson",3.13,1.32,1.06,0.61,0.18],["Jay Humphries",7.63,1.68,3.31,1.07,0.09],["Jeff Hornacek",14.72,2.88,4.24,1.39,0.23],["Jeff Malone",18.49,2.62,1.84,0.61,0.1],["John Crotty",3.22,0.87,2.06,0.4,0.05],["John Stockton",14.93,2.91,11.94,2.29,0.25],["Karl Malone",27.22,10.73,3.69,1.42,0.86],["Larry Krystkowiak",7.2,3.9,1,0.6,0.2],["Mark Eaton",4.07,6.58,0.48,0.41,2.2],["Mike Brown",6.1,4.8,0.75,0.43,0.32],["Shandon Anderson",7.56,2.75,1,0.67,0.17],["Stephen Howard",2.85,1.51,0.19,0.28,0.21],["Thurl Bailey",11.29,4.51,1.4,0.44,1.06],["Todd Fuller",3.4,2.4,0.1,0.1,0.3],["Tom Chambers",8.68,3.35,0.95,0.4,0.4],["Tony Brown",3.4,1.7,0.6,0.2,0],["Tyrone Corbin",9.56,5.59,1.74,1.18,0.31],["Walter Bond",3.66,1.2,0.67,0.3,0.2],["Walter Palmer",1.4,0.8,0.2,0.1,0.1]]],
    ["UTA","2000s",[["Adam Keefe",2.2,2.2,0.5,0.3,0.2],["Andre Owens",3,0.9,0.3,0.2,0],["Andrei Kirilenko",12.47,5.82,2.79,1.42,2.21],["Armen Gilliam",6.7,4.2,0.8,0.2,0.3],["Ben Handlogten",4.28,3.14,0.51,0.26,0.2],["Brevin Knight",2.4,1.2,2.6,0.9,0.1],["Bryon Russell",12.06,4.65,2.03,1.29,0.3],["C.J. Miles",5.9,1.65,1.06,0.47,0.14],["Calbert Cheaney",8.6,3.5,2,0.8,0.2],["Carlos Arroyo",8.72,1.77,3.87,0.68,0.07],["Carlos Boozer",19.21,10.27,2.78,1,0.37],["Curtis Borchardt",3.12,3.32,0.74,0.14,0.58],["Danny Manning",7.4,2.6,1.1,0.6,0.4],["David Benoit",3.6,1.7,0.4,0.1,0.1],["DeShawn Stevenson",5.91,1.92,1.21,0.41,0.24],["Dee Brown",1.9,0.8,1.7,0.4,0.1],["Derek Fisher",10.1,1.8,3.3,1,0.1],["Deron Williams",16.2,2.9,8.69,1,0.25],["Devin Brown",7.5,2.6,1.3,0.5,0.2],["Donyell Marshall",14.1,7.25,1.64,0.96,1.08],["Gordan Giriček",8.91,2.08,1.41,0.54,0.1],["Greg Ostertag",4.58,5.53,0.73,0.24,1.71],["Howard Eisley",7.18,1.67,3.82,0.65,0.1],["Jacque Vaughn",4.93,1.31,2.78,0.5,0],["Jarron Collins",4.27,3.11,0.84,0.28,0.18],["Jason Hart",2.9,1,1.5,0.5,0.1],["Jeff Hornacek",12.4,2.4,2.6,0.9,0.2],["John Amaechi",2.62,1.76,0.45,0.2,0.15],["John Crotty",4.83,1.41,2.41,0.37,0],["John Starks",7.01,1.59,1.79,0.77,0.05],["John Stockton",11.95,2.78,8.3,1.72,0.25],["Karl Malone",22.93,8.55,4.3,1.42,0.7],["Keith McLeod",6.58,1.6,3.28,0.87,0.14],["Kirk Snyder",5,1.8,0.5,0.4,0.3],["Kosta Koufos",4.7,2.9,0.4,0.3,0.6],["Kris Humphries",3.57,2.71,0.55,0.4,0.3],["Kyle Korver",9.31,2.79,1.64,0.52,0.44],["Kyrylo Fesenko",2.09,2.1,0.2,0.21,0.58],["Mark Jackson",4.7,2.1,4.6,0.6,0],["Matt Harpring",11.92,4.93,1.36,0.74,0.16],["Mehmet Okur",16,7.85,2.03,0.59,0.67],["Michael Ruffin",2.2,5,1,0.5,0.5],["Mikki Moore",4.6,2.9,0.7,0.3,0.5],["Milt Palacio",6.2,1.9,2.7,0.7,0.2],["Mo Williams",5,1.3,1.3,0.5,0],["Morris Almond",3.09,1.08,0.3,0.17,0.15],["Olden Polynice",5.3,5.1,0.45,0.35,1],["Paul Millsap",9.37,6.41,1.18,0.9,0.93],["Pete Chilcutt",1.8,1.7,0.4,0.2,0.2],["Quincy Lewis",3.78,1.38,0.62,0.37,0.25],["Rafael Araújo",2.6,2.4,0.4,0.2,0.1],["Raja Bell",11.68,3.03,1.34,0.76,0.16],["Raül López",6.51,1.74,3.78,0.77,0.03],["Ronnie Brewer",10.7,2.78,1.58,1.44,0.29],["Ronnie Price",3.84,1.03,1.67,0.64,0.05],["Rusty LaRue",5.8,1.5,2.2,0.5,0.2],["Sasha Pavlović",4.8,2,0.8,0.5,0.2],["Scott Padgett",4.97,2.96,0.84,0.46,0.22],["Tom Gugliotta",3.7,5.2,1.7,0.7,0.3],["Tony Massenburg",4.7,2.7,0.3,0.3,0.3]]],
    ["UTA","2010s",[["Al Jefferson",18.48,9.5,2.02,0.8,1.56],["Alec Burks",9.61,2.87,1.6,0.6,0.15],["Andrei Kirilenko",11.8,4.86,2.86,1.35,1.2],["Boris Diaw",4.6,2.2,2.3,0.2,0.1],["Brandon Rush",2.1,1.2,0.6,0.1,0.2],["C.J. Miles",10.82,2.77,1.56,0.87,0.38],["Carlos Boozer",19.5,11.2,3.2,1.1,0.5],["Chris Johnson",3.47,1.84,0.6,0.57,0.26],["Dante Exum",5.91,1.75,2.26,0.4,0.18],["DeMarre Carroll",5.72,2.73,0.88,0.83,0.33],["Deron Williams",19.77,3.96,10.17,1.26,0.2],["Derrick Favors",12.1,7.38,1.18,0.83,1.36],["Devin Harris",12.26,1.93,5.08,0.96,0.18],["Diante Garrett",3.5,1.4,1.7,0.6,0.1],["Donovan Mitchell",22.13,3.9,3.95,1.45,0.35],["Earl Watson",3.31,2.19,3.86,0.88,0.26],["Ekpe Udoh",2.47,2.13,0.67,0.48,0.93],["Elijah Millsap",4.26,2.78,1.14,0.96,0.27],["Enes Freedom",9.31,5.89,0.49,0.39,0.41],["Eric Maynor",5.2,1.5,3.1,0.5,0.1],["Francisco Elson",2.2,1.9,0.5,0.3,0.2],["George Hill",16.9,3.4,4.2,1,0.2],["Georges Niang",3.6,1.43,0.56,0.2,0.09],["Gordon Hayward",15.64,4.17,3.42,1.01,0.41],["Grayson Allen",5.6,0.6,0.7,0.2,0.2],["Ian Clark",2.45,0.7,0.55,0.3,0.1],["Jae Crowder",11.87,4.55,1.65,0.83,0.37],["Jamaal Tinsley",3.39,1.51,3.93,0.78,0.19],["Jeff Withey",3.6,2.9,0.25,0.35,0.8],["Jeremy Evans",3.68,2.69,0.48,0.36,0.5],["Joe Ingles",8.01,3.11,3.35,1.02,0.12],["Joe Johnson",8.65,3.16,1.68,0.47,0.2],["John Lucas III",3.8,0.9,1,0.3,0],["Jonas Jerebko",5.8,3.3,0.6,0.3,0.2],["Josh Howard",8.7,3.7,1.2,0.7,0.2],["Kosta Koufos",1.5,1.3,0.2,0.1,0.1],["Kyle Korver",8.17,2.3,1.45,0.45,0.2],["Kyrylo Fesenko",2.29,1.9,0.3,0.1,0.35],["Marvin Williams",8.1,4.31,1.15,0.64,0.5],["Mehmet Okur",12.2,6.37,1.58,0.47,0.98],["Mike Harris",4.2,1.7,0.3,0.8,0.4],["Mo Williams",12.9,2.4,6.2,1,0.2],["Paul Millsap",14.89,7.51,2.24,1.3,0.99],["Raja Bell",7.47,2.2,1.5,0.67,0.17],["Randy Foye",10.8,1.5,2,0.8,0.3],["Raul Neto",4.82,1.33,1.87,0.56,0.06],["Richard Jefferson",10.1,2.7,1.6,0.7,0.2],["Ricky Rubio",12.91,4.13,5.68,1.46,0.1],["Rodney Hood",13.15,3.05,2.02,0.74,0.2],["Ronnie Brewer",9.5,3.4,2.8,1.6,0.3],["Ronnie Price",3.8,1.1,1.51,0.7,0.15],["Royce O'Neale",5.11,3.45,1.45,0.61,0.25],["Rudy Gobert",11.15,10.55,1.34,0.68,2.19],["Shelvin Mack",9.45,2.81,3.64,0.83,0.1],["Steve Novak",2.2,0.7,0.3,0,0],["Sundiata Gaines",3.3,0.9,1.2,0.4,0],["Thabo Sefolosha",5.7,3.23,0.67,1.12,0.19],["Trevor Booker",6.55,5.35,1.1,0.6,0.5],["Trey Burke",12.13,2.53,4.16,0.68,0.14],["Trey Lyles",6.15,3.51,0.84,0.35,0.25],["Wesley Matthews",9.4,2.3,1.5,0.8,0.2]]],
    ["UTA","2020s",[["Ersan Ilyasova",3.8,1.7,0.2,0.6,0.2],["Rudy Gay",6.7,3.7,1,0.4,0.3],["Mike Conley",14.9,3.2,5.7,1.4,0.2],["Kevin Love",6.7,5.8,1.8,0.4,0.2],["Derrick Favors",5.4,5.5,0.6,0.5,1],["Hassan Whiteside",8.2,7.6,0.4,0.3,1.6],["Bojan Bogdanovic",17.6,4.1,1.8,0.6,0.1],["Kelly Olynyk",12.5,6.2,3.7,0.9,0.5],["Rudy Gobert",14.9,14.1,1.2,0.6,2.4],["Norvel Pelle",2,2,0,0,0.3],["Jordan Clarkson",17.7,3.6,3.6,0.7,0.2],["Jusuf Nurkić",10.9,10.4,4.8,1.3,0.5],["Joe Ingles",12.1,3.6,4.7,0.7,0.2],["Stanley Johnson",5.8,3.2,2.2,0.5,0.2],["Royce O'Neale",7.2,5.8,2.5,1,0.5],["Kris Dunn",9.3,3.7,4.7,1.1,0.5],["Damian Jones",3.5,3,0.4,0.2,0.5],["Denzel Valentine",2.9,1.8,0.5,0.3,0],["Georges Niang",6.9,2.4,0.8,0.3,0.1],["Juancho Hernangomez",3.3,2.5,0.5,0.4,0.3],["Danuel House Jr.",5.9,2.6,1,0.5,0.4],["Lauri Markkanen",23.6,7.4,1.9,0.8,0.5],["Donovan Mitchell",26.1,4.3,5.2,1.2,0.2],["John Collins",17.1,8.3,1.6,0.8,0.9],["Udoka Azubuike",3.1,2.8,0.1,0.1,0.4],["Mo Bamba",2.5,5.5,0.3,0,0.8],["Jaren Jackson Jr.",19.4,5.7,2,1.1,1.4],["Svi Mykhailiuk",9.1,2.5,1.9,0.5,0.2],["Collin Sexton",17.1,2.5,4,0.7,0.1],["Juan Toscano-Anderson",3,2.4,1.3,0.3,0.2],["Zylan Cheatham",0,0,0,0,0],["Nickeil Alexander-Walker",10.6,2.9,2.4,0.7,0.4],["Darius Bazley",5.3,3.1,0.8,0.7,0.8],["Talen Horton-Tucker",10.4,2.8,3.6,0.8,0.4],["Miye Oni",1.1,1,0.4,0.1,0.1],["Eric Paschall",5.8,1.8,0.6,0.2,0.1],["Luka Samanic",7,3.3,1.2,0.5,0.2],["Jarrell Brantley",3.9,1.2,0.7,0.1,0.3],["John Konchar",4.4,4.3,2.1,1.5,0.7],["Matt Thomas",3.1,1,0.4,0.1,0],["Juwan Morgan",1.2,1,0.3,0.1,0],["Vernon Carey Jr.",0.5,1,0.3,0.2,0.2],["Kira Lewis Jr.",3.2,0.9,1.3,0.3,0.1],["Elijah Hughes",1.7,0.5,0.3,0.1,0.1],["Leandro Bolmaro",0.4,0.5,0.5,0.2,0.1],["Omer Yurtseven",4.6,4.3,0.6,0.2,0.4],["Jared Butler",3.8,1.1,1.5,0.4,0.2],["KJ Martin",6.4,2.9,1.1,0.4,0.5],["Trent Forrest",3.1,1.6,1.6,0.4,0.1],["Xavier Sneed",0.6,0.7,0.1,0,0],["Jaden Springer",2.5,1.3,0.8,0.6,0.1],["Ochai Agbaji",7.9,2.1,1.1,0.3,0.3],["Johnny Juzang",7,2.3,0.9,0.3,0.1],["Jason Preston",1.7,2.4,2.3,0.3,0.1],["Micah Potter",3.7,3.1,0.6,0.3,0.3],["Kennedy Chandler",15,3.4,6.7,1,0.2],["Walker Kessler",10.7,9.7,1.6,0.7,2.2],["Oscar Tshiebwe",7.7,7.6,0.9,0.8,0.2],["Vince Williams Jr.",7.5,3.9,4.2,0.7,0.4],["Kenneth Lofton Jr.",4.6,1.8,1.6,0.3,0.2],["Simone Fontecchio",6.3,1.7,0.8,0.3,0.2],["Taylor Hendricks",6,4.8,0.8,1.2,1.1],["Keyonte George",17.8,3.4,5.4,0.8,0.2],["Brice Sensabaugh",11.1,3.1,1.7,0.6,0.2],["Elijah Harkless",5,2,1.9,1.1,0.2],["Cody Williams",6.7,2.6,1.6,0.7,0.3],["Isaiah Collier",10.2,2.9,6.8,1,0.2],["Kyle Filipowski",10.5,6.7,2.2,0.8,0.4],["Blake Hinson",11.9,2.4,1.1,0.4,0.1],["Ace Bailey",13.8,4.2,1.8,0.8,0.7],["Bez Mbeng",8.1,3.8,4.1,2.3,0.3],["Hayden Gray",6,0,1,1,1],["Andersson Garcia",5.2,8.4,2.8,1.6,0.8]]],
    ["WAS","1960s",[["Al Butler",2.4,0.8,0.5,null,null],["Bailey Howell",18.36,10.41,2.3,null,null],["Barney Cable",3.7,4.2,0.7,null,null],["Barry Orms",2.8,2.5,0.8,null,null],["Ben Warley",5.77,4.54,0.61,null,null],["Bob Ferry",6.02,4.42,1.26,null,null],["Bob Quick",3.1,0.9,0.4,null,null],["Charlie Hardnett",4.31,3.82,0.33,null,null],["Don Kojis",6.3,4,0.7,null,null],["Don Ohl",18.93,3.73,3.21,null,null],["Earl Monroe",25.04,4.61,4.6,null,null],["Ed Manning",4.33,4.64,0.41,null,null],["Gary Bradds",3.23,2.05,0.49,null,null],["Gene Shue",4.2,2,3.2,null,null],["Gus Johnson",18.5,12.72,2.7,null,null],["Jack Marin",13.11,5.85,1.72,null,null],["Jerry Sloan",5.7,3.9,1.9,null,null],["Jim Barnes",12.1,10.3,1.3,null,null],["John Barnhill",7.61,2.57,2.53,null,null],["Johnny Egan",9,2.27,3.25,null,null],["Johnny Green",9.88,7.26,1.12,null,null],["Kevin Loughery",16.34,3.23,3.89,null,null],["Leroy Ellis",11.51,9.83,1.67,null,null],["Mel Counts",6.4,6.2,1.2,null,null],["Ray Scott",14.78,11.51,1.98,null,null],["Red Kerr",11,8.3,3.2,null,null],["Rod Thorn",14.4,4.8,3.7,null,null],["Si Green",8.13,3.12,2.47,null,null],["Stan McKenzie",4.1,2.4,0.5,null,null],["Terry Dischinger",20.8,8.3,2,null,null],["Tom Workman",2.43,1.29,0.1,null,null],["Wali Jones",5.3,1.8,2.6,null,null],["Walt Bellamy",25.57,15.66,2.01,null,null],["Wayne Hightower",7.02,5.8,0.92,null,null],["Wes Unseld",13.8,18.2,2.6,null,null]]],
    ["WAS","1970s",[["Al Tucker",4.44,2.16,0.25,null,null],["Archie Clark",19.62,3.13,6.85,1.1,0.1],["Bob Dandridge",19.86,5.8,4.26,1.1,0.65],["Bob Weiss",2.5,1.1,2.1,0.9,0.1],["Charles Johnson",8.91,2.47,2.17,1.07,0.07],["Clem Haskins",5.06,1.06,1.19,0.34,0.1],["Dave Bing",13.75,2.59,5.25,1.22,0.21],["Dave Corzine",3,2.5,0.8,0.2,0.2],["Dave Stallworth",7.5,4.16,1.49,0.6,0.1],["Dennis DuVal",1.6,0.6,0.4,0.4,0.1],["Dick Gibbs",3.3,1,0.3,0.2,0.1],["Dorie Murrey",2.78,2.84,0.36,null,null],["Earl Monroe",22.39,2.85,4.63,null,null],["Ed Manning",2.4,1.2,0.1,null,null],["Eddie Miles",9.71,2.64,1.68,null,null],["Elvin Hayes",21.52,13.38,1.86,1.25,2.47],["Flynn Robinson",6.9,1.4,2,null,null],["Fred Carter",7.81,2.99,1.91,null,null],["Gary Zeller",3.49,1.15,0.46,null,null],["George Johnson",3.9,4.8,0.4,null,null],["Greg Ballard",6.41,4.54,1.11,0.56,0.3],["Gus Johnson",15.3,13.33,2.77,null,null],["Jack Marin",20.23,6.53,2.47,null,null],["Jimmy Jones",6.44,1.93,2.02,0.76,0.1],["Joe Pace",3.22,2.09,0.35,0.16,0.48],["John Tresvant",6.2,4.5,1.02,null,null],["Kevin Grevey",10.79,2.74,1.46,0.55,0.15],["Kevin Loughery",17.67,2.86,4.34,null,null],["Kevin Porter",10.91,1.73,5.8,1.55,0.1],["Larry Wright",8.74,1.56,3.59,0.86,0.16],["Leonard Gray",6,3.2,1.2,0.5,0.3],["Leroy Ellis",6.6,5.2,0.7,null,null],["Louie Nelson",4.9,1.4,1.1,0.6,0],["Manny Leaks",4.1,4.6,0.5,0.2,0.7],["Mike Davis",11.45,2.38,1.91,null,null],["Mike Riordan",12.41,3.37,2.78,0.85,0.14],["Mitch Kupchak",13.4,6.43,1.05,0.33,0.43],["Nick Weatherspoon",7.66,4.69,0.67,0.72,0.28],["Phil Chenier",18.19,3.75,3.11,1.72,0.62],["Phil Walker",4.5,1.3,1.4,0.4,0.1],["Ray Scott",8.9,6.3,1.6,null,null],["Rich Rinaldi",5,1.21,0.95,0.4,0.1],["Roger Phegley",2.8,0.8,0.5,0.2,0.1],["Stan Love",7.16,4.4,0.65,null,null],["Terry Driscoll",2.63,2.71,0.59,null,null],["Tom Henderson",11.11,2.53,5.58,1.24,0.16],["Tom Kozelko",2.17,1.81,0.54,0.36,0.1],["Tom Kropp",0.8,0.6,0.3,0.1,0],["Truck Robinson",10.13,6.16,0.99,0.54,0.77],["Walt Wesley",4.3,3.5,0.4,0.2,0.5],["Wes Unseld",10.81,13.88,4.07,1.15,0.61]]],
    ["WAS","1980s",[["Andre McCarter",2.8,0.9,1.7,0.3,0],["Anthony Roberts",4.9,2.6,0.8,0.4,0],["Austin Carr",4.9,1.3,1.3,0.4,0.1],["Bernard King",19.09,4.42,3.23,0.75,0.15],["Bob Dandridge",14.9,4.86,3.53,0.63,0.66],["Bryan Warrick",3.15,1.22,2.22,0.41,0.16],["Carlos Terry",3.02,2.42,1.3,0.54,0.27],["Charles Davis",5.64,2.56,0.79,0.31,0.24],["Charles Jones",3.44,4.47,0.85,0.71,1.62],["Cliff Robinson",17.83,8.87,2.44,1.13,0.69],["Dan Roundfield",10.03,7.04,1.79,0.44,0.54],["Darrell Walker",7.81,4.81,4.55,1.68,0.26],["Darren Daye",7.81,2.95,2.38,0.63,0.2],["Darwin Cook",7.5,1.8,1.8,1.2,0.2],["Dave Batton",3.3,2.2,0.5,0.3,0.2],["Dave Corzine",2.9,3.5,0.8,0.1,0.4],["Dave Feitl",5,3.5,0.6,0.3,0.3],["Don Collins",10.17,2.68,1.91,1.12,0.39],["Dudley Bradley",3.87,1.6,1.96,1.25,0.15],["Elvin Hayes",20.4,10.4,1.4,0.8,2.2],["Ennis Whatley",8.2,2.65,5.21,1.23,0.11],["Frank Johnson",10.45,1.96,5.13,1.12,0.1],["Garry Witts",2.9,1.3,0.8,0.4,0.1],["Greg Ballard",15.88,6.98,2.81,1.36,0.38],["Gus Bailey",1.9,1.4,1.3,0.4,0.2],["Gus Williams",16.79,2.35,6.81,1.76,0.3],["Harvey Grant",5.6,2.3,1.1,0.5,0.4],["Jay Murphy",3.04,1.87,0.17,0.07,0.07],["Jay Vincent",13.3,4.1,1.7,0.8,0.3],["Jeff Malone",19.57,2.65,2.72,0.65,0.18],["Jeff Ruland",18.64,10.84,3.24,0.77,0.86],["Jim Chones",3.1,3.1,1.1,0.3,0.5],["Jim Cleamons",7.8,2.3,4.4,0.8,0.2],["Joe Kopicki",3.74,2.98,0.73,0.34,0.1],["John Lucas",7.08,1.7,5.74,1.05,0.07],["John Williams",11.94,5.72,3.18,1.6,0.57],["John Williamson",10.01,1.34,1.44,0.32,0.25],["Kenny Green",5.5,1.9,0.2,0.2,0.4],["Kevin Grevey",13.65,2.57,2.67,0.73,0.23],["Kevin McKenna",5.8,1.2,0.8,1,0.1],["Kevin Porter",10.15,1.3,7.64,1.11,0.14],["Larry Wright",7.3,1.6,2.9,0.6,0.2],["Ledell Eackles",11.5,2.3,1.5,0.5,0.1],["Leon Wood",9.7,1.6,2.7,0.5,0],["Manute Bol",3.04,4.68,0.2,0.23,3.81],["Mark Alarie",6.01,2.99,0.76,0.25,0.25],["Michael Adams",7.2,2,3.9,1.3,0.1],["Mike Gibson",1.7,2.1,0.3,0.2,0.2],["Mitch Kupchak",9.94,5.49,0.67,0.33,0.27],["Moses Malone",22.12,11.25,1.5,0.75,1.09],["Muggsy Bogues",5,1.7,5.1,1.6,0],["Phil Chenier",10.1,2.2,2.1,0.9,0.3],["Rick Mahorn",8.98,8.16,1.47,0.77,1.49],["Ricky Sobers",15.63,2.3,4.9,1.43,0.23],["Roger Phegley",11.1,2.3,1.4,0.4,0.1],["Spencer Haywood",11.6,5.33,0.8,0.5,0.83],["Steve Colter",7.24,2.51,3.38,0.94,0.24],["Terry Catledge",11.42,6.74,0.83,0.57,0.2],["Tom McMillen",8.07,2.77,0.87,0.16,0.23],["Wes Matthews",12.3,1.5,4.4,1,0.2],["Wes Unseld",8.96,12.17,3.72,0.8,0.66]]],
    ["WAS","1990s",[["A.J. English",9.93,2.1,2.12,0.4,0.15],["Andre Turner",4.1,1.3,2.5,0.8,0],["Anthony Tucker",3.9,2.7,1.1,0.7,0.2],["Ashraf Amaya",1.3,1.7,0.1,0.2,0.1],["Ben Wallace",3.54,5.18,0.29,0.8,1.2],["Bernard King",25.03,4.94,4.6,0.73,0.19],["Bob McCann",3,2.3,0.4,0.3,0.2],["Brent Price",6.91,1.96,3.66,0.88,0],["Buck Johnson",6.5,2.7,1.2,0.5,0.2],["Byron Irvin",5.23,1.36,0.68,0.48,0.09],["Calbert Cheaney",12.74,3.5,1.92,1.02,0.29],["Charles Jones",2.07,5.09,1.01,0.64,1.69],["Chris Webber",20.96,9.66,4.39,1.62,1.66],["Chris Whitney",5.27,1.35,2.22,0.54,0.05],["Darrell Walker",8.71,7.96,7.3,1.42,0.45],["Darvin Ham",2,1.8,0.2,0.3,0.4],["David Wingate",7.9,3.3,3,1.5,0.3],["Don MacLean",12.52,4.28,1.39,0.41,0.19],["Doug Overton",6.16,1.67,2.63,0.53,0.02],["Doug Roth",1.9,2.9,0.5,0.2,0.3],["Ed Horton",4.5,2.4,0.4,0.2,0.1],["Gheorghe Mureșan",10.54,6.87,0.49,0.63,1.6],["Greg Foster",4.18,2.88,0.74,0.14,0.32],["Harvey Grant",11.55,4.96,1.86,0.83,0.53],["Haywoode Workman",8,3.3,4.8,1.2,0.1],["Jahidi White",2.5,2.9,0.1,0.2,0.6],["Jaren Jackson",5,1.8,0.9,0.6,0.2],["Jeff Malone",24.3,2.7,3.2,0.6,0.1],["Jeff McInnis",3.7,0.6,2.1,0.5,0],["Jim McIlvaine",2.06,2.49,0.14,0.26,1.69],["John Williams",14.51,6.18,4.25,1.2,0.31],["Juwan Howard",19.29,7.92,3.51,1.02,0.36],["Kenny Walker",4.21,3.51,0.45,0.35,0.65],["Kevin Duckworth",6.78,4.77,0.69,0.5,0.54],["LaBradford Smith",7.4,1.55,2.35,0.82,0.06],["Larry Stewart",8.51,4.52,1.45,0.6,0.43],["Ledell Eackles",11.31,2.28,1.76,0.6,0.09],["Lorenzo Williams",2.19,2.88,0.2,0.22,0.32],["Mark Alarie",8.91,3.99,1.5,0.6,0.4],["Melvin Turpin",4.7,3.7,0.5,0.3,0.8],["Michael Adams",15.11,3.36,7.34,1.58,0.1],["Mitch Richmond",19.7,3.4,2.4,1.3,0.2],["Mitchell Butler",6.4,2.4,1.1,0.74,0.2],["Otis Thorpe",11.3,6.8,2.1,0.9,0.4],["Pervis Ellison",13.89,8.38,2.01,0.73,2.09],["Rasheed Wallace",10.1,4.7,1.3,0.6,0.8],["Rex Chapman",15.55,2.11,2.58,0.99,0.19],["Robert Pack",18.1,4.3,7.8,2,0],["Rod Strickland",17.1,4.7,9.72,1.7,0.22],["Scott Skiles",13,2.6,7.3,1.1,0.1],["Steve Colter",4.9,2.4,2,0.6,0.1],["Terry Davis",4.07,5.6,0.37,0.5,0.23],["Tim Legler",6.89,1.56,1.31,0.41,0.18],["Tom Gugliotta",15.88,9.43,3.63,2,0.59],["Tom Hammonds",6.71,3.33,0.76,0.29,0.2],["Tracy Murray",11.46,3.08,0.96,0.76,0.24]]],
    ["WAS","2000s",[["Aaron Williams",7.6,5,0.7,0.5,1.1],["Andray Blatche",6.71,4.33,1.09,0.51,0.95],["Antawn Jamison",20.76,8.86,1.89,1.11,0.3],["Anthony Peeler",3.8,1.6,1.4,0.5,0.1],["Antonio Daniels",8.19,2.28,3.95,0.71,0.07],["Awvee Storey",1.7,0.9,0.2,0.1,0],["Bobby Simmons",3.48,1.92,0.6,0.35,0.15],["Brendan Haywood",7.52,5.92,0.64,0.44,1.45],["Brevin Knight",4.3,1.9,3.2,1.6,0],["Bryon Russell",4.5,3,1,1,0.1],["Calvin Booth",2.64,2.66,0.48,0.26,1.05],["Caron Butler",19.37,6.6,3.78,1.88,0.27],["Charles Oakley",1.8,2.5,1,0.3,0.1],["Chris Whitney",8.72,1.71,3.7,0.8,0.1],["Christian Laettner",8,5.76,2.58,1.04,0.53],["Chucky Atkins",6.7,1.6,2.5,0.5,0],["Courtney Alexander",12.14,2.73,1.5,0.76,0.1],["Darius Songaila",6.94,3.24,1.37,0.7,0.26],["DeShawn Stevenson",10.45,2.69,2.93,0.78,0.18],["Dominic McGuire",3,3.8,1.61,0.57,0.67],["Donell Taylor",2.7,1.05,0.95,0.5,0.1],["Etan Thomas",5.98,4.93,0.39,0.34,1.11],["Felipe López",8.1,3.4,1.6,0.9,0.4],["Gerard King",5.09,3.54,0.76,0.42,0.2],["Gilbert Arenas",25.8,4.31,5.6,1.86,0.25],["Hubert Davis",7.88,1.61,2.37,0.48,0.08],["Isaac Austin",6.7,4.8,1.3,0.3,0.6],["JaVale McGee",6.5,3.9,0.3,0.4,1],["Jahidi White",6.79,6.76,0.22,0.41,1.19],["Jared Jeffries",6.11,4.84,1.59,0.73,0.45],["Jarvis Hayes",8.86,3.45,1.35,0.81,0.18],["Javaris Crittenton",5.3,2.9,2.6,0.7,0.1],["Jerry Stackhouse",19.44,3.67,4.36,0.9,0.32],["Juan Dixon",7.52,1.79,1.82,0.84,0.1],["Juwan Howard",16.21,6.22,2.96,0.84,0.34],["Kwame Brown",7.7,5.44,0.99,0.62,0.7],["Laron Profit",3.04,1.5,1.38,0.53,0.16],["Larry Hughes",17.71,5.37,3.39,1.91,0.37],["Michael Jordan",21.23,5.93,4.39,1.46,0.46],["Michael Ruffin",1.27,3.61,0.54,0.41,0.43],["Michael Smith",4.72,7.14,1.26,0.66,0.5],["Mike James",9.6,2.4,3.6,0.8,0.1],["Mitch Richmond",17,2.9,2.67,1.4,0.2],["Mitchell Butler",3.3,1.7,0.8,0.5,0.1],["Nick Young",9.28,1.66,1.01,0.5,0.15],["Obinna Ekezie",3.5,2.6,0.3,0.2,0.2],["Oleksiy Pecherov",3.6,2.14,0.15,0.2,0.1],["Popeye Jones",5.77,6.43,1.27,0.53,0.2],["Reggie Jordan",1.1,1.1,0.9,0.3,0.1],["Richard Hamilton",15.62,2.75,2.37,0.68,0.13],["Rod Strickland",12.47,3.61,7.34,1.37,0.24],["Roger Mason",6.31,1.21,1.22,0.37,0.16],["Steve Blake",5.31,1.6,2.36,0.62,0.06],["Tracy Murray",10.2,3.4,0.9,0.6,0.3],["Tyrone Nesby",7.15,3.77,1.34,0.9,0.3],["Tyronn Lue",8.21,1.85,3.5,0.65,0]]],
    ["WAS","2010s",[["A.J. Price",7.7,2,3.6,0.6,0.1],["Al Harrington",6.6,2.4,0.8,0.4,0],["Al Thornton",8.89,3.56,1.07,0.67,0.3],["Alonzo Gee",5.15,2.5,0.55,0.6,0.05],["Andray Blatche",14.26,6.94,2.02,1.16,0.83],["Andre Miller",3.67,1.68,3.05,0.44,0.04],["Andrew Nicholson",2.5,1.2,0.3,0.4,0.2],["Antawn Jamison",20.5,8.8,1.3,1,0.2],["Austin Rivers",7.2,2.4,2,0.6,0.3],["Bobby Portis",14.3,8.6,1.5,0.9,0.4],["Bojan Bogdanović",12.7,3.1,0.8,0.4,0.2],["Bradley Beal",19.83,3.93,3.73,1.15,0.38],["Brandon Jennings",3.5,1.9,4.7,0.7,0],["Brendan Haywood",9.8,10.3,0.4,0.4,2.1],["Caron Butler",16.9,6.7,2.3,1.4,0.3],["Cartier Martin",5.83,2.12,0.45,0.42,0.1],["Chasson Randle",5.5,1.1,2,0.5,0.1],["Chris McCullough",2.22,1.27,0.18,0.05,0.27],["Chris Singleton",4.14,3.16,0.58,0.83,0.39],["DeJuan Blair",2,1.95,0.25,0.25,0.05],["DeShawn Stevenson",2.2,1.6,1.1,0.3,0.1],["Dominic McGuire",0.7,1.5,0.2,0.1,0.1],["Drew Gooden",5.23,4.1,0.76,0.39,0.28],["Earl Boykins",6.6,1.1,2.6,0.4,0],["Emeka Okafor",9.7,8.8,1.2,0.6,1],["Eric Maynor",2.3,1,1.7,0.2,0],["Fabricio Oberto",1.5,1.8,0.9,0.2,0.2],["Garrett Temple",4.58,1.92,1.53,0.78,0.19],["Gary Neal",9.8,2.1,1.2,0.5,0],["Gilbert Arenas",20.5,3.84,6.57,1.34,0.42],["Hilton Armstrong",1.9,2.8,0.2,0.4,0.4],["Ian Mahinmi",4.81,4.18,0.68,0.68,0.57],["JaVale McGee",9.28,6.88,0.42,0.46,2.19],["Jabari Parker",15,7.2,2.7,0.9,0.6],["James Singleton",6.67,6.87,0.86,0.58,0.99],["Jan Veselý",3.55,3.44,0.57,0.58,0.49],["Jared Dudley",7.9,3.5,2.1,0.9,0.2],["Jarell Eddie",2.4,0.9,0.2,0.2,0],["Jason Smith",4.86,2.93,0.52,0.22,0.59],["Jeff Green",12.3,4,1.8,0.6,0.5],["Jodie Meeks",6.3,1.6,0.9,0.4,0.1],["John Wall",18.99,4.33,9.21,1.69,0.7],["Jordan Crawford",14.53,2.84,3.4,0.9,0.1],["Jordan McRae",5.9,1.5,1.1,0.5,0.3],["Josh Howard",9.51,3.95,1.25,0.72,0.34],["Kelly Oubre Jr.",8.18,3.51,0.7,0.72,0.3],["Kevin Séraphin",6.43,3.65,0.53,0.22,0.74],["Kirk Hinrich",11.1,2.7,4.4,1.2,0.2],["Kris Humphries",7.51,5.77,0.81,0.38,0.43],["Marcin Gortat",11.58,9.21,1.52,0.54,1.1],["Marcus Thornton",7.14,2.36,1.26,0.69,0.1],["Markieff Morris",12.52,5.88,1.75,0.91,0.57],["Martell Webster",9.29,3.01,1.37,0.49,0.17],["Maurice Evans",7.4,1.94,0.5,0.65,0.16],["Mike Miller",10.9,6.2,3.9,0.7,0.2],["Mike Scott",8.8,3.3,1.1,0.3,0.1],["Nenê",11.82,5.55,2.28,0.97,0.59],["Nick Young",13.56,2.09,0.95,0.6,0.22],["Otto Porter Jr.",10.71,4.95,1.44,1.19,0.41],["Paul Pierce",11.9,4,2,0.6,0.3],["Quinton Ross",1.5,0.9,0.2,0.2,0.1],["Ramon Sessions",8.86,2.4,2.99,0.59,0.08],["Randy Foye",10.1,1.9,3.3,0.5,0.1],["Rashard Lewis",9.72,4.91,1.53,0.85,0.51],["Rasual Butler",7.7,2.6,0.8,0.4,0.3],["Roger Mason",5.5,1.3,0.9,0.3,0.1],["Sam Dekker",6.1,3,1,0.7,0.2],["Shaun Livingston",7.03,2.2,3.59,0.54,0.22],["Sheldon Mac",3,1.1,0.5,0.3,0.1],["Shelvin Mack",3.77,1.49,2.13,0.45,0],["Thomas Bryant",10.5,6.3,1.3,0.3,0.9],["Tim Frazier",3,1.9,3.3,0.8,0.1],["Tomáš Satoranský",6.63,2.85,3.69,0.76,0.17],["Trevor Ariza",12.77,5.53,2.66,1.41,0.33],["Trevor Booker",6.42,5.11,0.75,0.65,0.6],["Trey Burke",5,0.8,1.8,0.2,0.1],["Troy Brown Jr.",4.8,2.8,1.5,0.4,0.1],["Yi Jianlian",5.6,3.9,0.4,0.4,0.5]]],
    ["WAS","2020s",[["Russell Westbrook",22.2,11.5,11.7,1.4,0.4],["Robin Lopez",9,3.8,0.8,0.2,0.6],["Taj Gibson",3.4,1.9,0.7,0.3,0.2],["Ish Smith",6.5,2.8,3.8,0.7,0.3],["Davis Bertans",11.5,2.9,0.9,0.6,0.2],["Brad Wanamaker",3.6,1.7,2.4,0.3,0.3],["Anthony Davis",20.4,11.1,2.8,1.1,1.7],["Bradley Beal",25.9,4.4,5.5,1,0.5],["Tomas Satoransky",3.6,2.3,3.3,0.5,0.1],["Khris Middleton",11.9,3.7,4.1,0.9,0.2],["Alex Len",6.6,4.1,0.8,0.3,1],["Kentavious Caldwell-Pope",13.2,3.4,1.9,1.1,0.3],["Raul Neto",8.1,2.1,2.7,1,0.1],["Marcus Smart",9,2.1,3.2,1.1,0.3],["Kristaps Porziņģis",21.7,8.2,2.5,0.8,1.6],["Tyus Jones",12,2.7,7.3,1.1,0.3],["Delon Wright",7.4,3.6,3.9,1.8,0.3],["D'Angelo Russell",10.2,2.3,4,0.5,0.1],["Richaun Holmes",6.2,5.2,1,0.3,0.6],["Skal Labissiere",4.3,3,1,0.7,0.3],["Malcolm Brogdon",12.7,3.8,4.1,0.5,0.2],["Anžejs Pasečņiks",0,1,1,0,0],["Kyle Kuzma",20.2,7.4,3.8,0.6,0.7],["Thomas Bryant",10.9,5,1.2,0.3,0.8],["Monte Morris",10.3,3.4,5.3,0.7,0.2],["Craig Sword",2,0,0.3,1.3,0],["Marvin Bagley III",11.7,6.2,1.1,0.4,0.7],["Hamidou Diallo",1,1,0.5,1,0],["Chandler Hutchison",4.3,3.1,0.7,0.5,0.2],["Jerome Robinson",4.9,2.2,1.5,0.7,0.4],["Landry Shamet",7.1,1.3,1.2,0.5,0.2],["Trae Young",17.9,2,8,0.9,0.1],["Rui Hachimura",12.6,4.7,1.2,0.7,0.2],["Isaac Bonga",2,1.7,0.6,0.3,0.2],["Kendrick Nunn",7.1,1.6,1.3,0.4,0.1],["Devon Dotson",0.5,1.7,1.3,0.8,0],["Daniel Gafford",8.5,5.2,0.8,0.4,1.4],["Jaylen Nowell",8.4,2.5,2.3,0.1,0.5],["Jordan Poole",18.9,2.9,4.5,1.2,0.3],["Tremont Waters",3.3,1.3,2.3,1.7,0],["Garrison Mathews",5.5,1.4,0.4,0.5,0.1],["Deni Avdija",9.7,5.9,2.5,0.8,0.4],["Vernon Carey Jr.",2.9,1.7,0,0.3,0.1],["Jared Butler",6.3,1.5,3.2,0.7,0.2],["Cassius Winston",1.9,0.2,0.8,0.1,0],["Isaiah Todd",1.6,1.5,0.5,0.2,0.1],["Anthony Gill",3.8,1.9,0.7,0.3,0.2],["Sharife Cooper",8.1,2.1,3,0.4,0.1],["JT Thor",3.6,2.4,0.3,0.4,0.5],["Justin Champagnie",7.8,4.9,1.2,0.9,0.6],["Joel Ayayi",0.3,0.4,0.6,0,0],["Corey Kispert",11.1,2.8,1.5,0.5,0.2],["Jay Huff",7.3,3,1.4,0.4,0.6],["Eugene Omoruyi",4.8,2,0.8,0.6,0.1],["Jordan Schakel",1.4,1,0.2,0.4,0],["Jordan Goodwin",3.3,1.9,1.4,0.5,0.2],["Jaime Echenique",0,0,0,0,0],["Jaden Hardy",9.2,1.5,1,0.3,0.1],["Johnny Davis",3.7,1.6,0.6,0.4,0.2],["Malaki Branham",4.6,1.6,0.8,0.4,0.1],["Patrick Baldwin Jr.",4.4,3.2,0.8,0.5,0.4],["Alondes Williams",11,6.3,3,0.8,0.8],["Quenton Jackson",6.2,0.9,1.7,0.4,0.1],["Jules Bernard",3.9,1.4,0.8,0.2,0.1],["Xavier Cooks",3.8,3.8,0.6,0.6,0.4],["Cam Whitmore",9.2,2.8,0.7,0.7,0.4],["Bilal Coulibaly",10.8,4.5,2.6,1.2,0.8],["Colby Jones",4,2.2,1.1,0.7,0.3],["Tristan Vukcevic",9,3.4,1.2,0.4,0.7],["Leaky Black",7.1,5,1.5,1.2,0.5],["Jaylen Martin",4.9,2.8,1.1,0.6,0],["Alex Sarr",14.7,7,2.5,0.8,1.8],["Bub Carrington",10.2,3.8,4.5,0.6,0.2],["Kyshawn George",11.8,4.7,3.5,1,0.8],["AJ Johnson",7.6,2,2.6,0.4,0.1],["Jamir Watkins",7.4,3.9,1.3,1.1,0.5],["Tre Johnson",12.2,2.8,2,0.6,0.3],["Will Riley",10.3,2.9,2,0.7,0.1],["Julian Reese",11.8,10.5,1.8,1.4,0.6],["Kadary Richmond",8.3,3.3,2.7,2.7,0.3]]],
  ];
  // END bundled reference stats
  const REFERENCE_TEAM_ALIASES = Object.freeze({
    NJN: "BKN", NYN: "BKN", BRK: "BKN", SEA: "OKC", CHH: "CHA", CHO: "CHA",
    NOH: "NOP", NOK: "NOP", PHO: "PHX", WSH: "WAS", WSB: "WAS", BAL: "WAS",
    CAP: "WAS", VAN: "MEM", SDC: "LAC", BUF: "LAC", CIN: "SAC", ROC: "SAC",
    NOJ: "UTA", STL: "ATL", TRI: "ATL", FTW: "DET", SYR: "PHI", SFW: "GSW",
    PHW: "GSW", MNL: "LAL",
  });
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
  // Provisional score-only outlook marker, NOT a verified v4 win cutoff.
  const LIVE_82_BENCHMARK = 110;
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

  function statContextKey(player, team, era) {
    // Accent/punctuation variants are spelling differences, not permission to
    // borrow a different franchise's or decade's peak. No fuzzy-name matching.
    const name = String(player || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
    const abbr = String(team || "").toUpperCase().trim();
    return `${REFERENCE_TEAM_ALIASES[abbr] || abbr}|${era}|${name}`;
  }

  function usableReferenceStats(stats) {
    if (!stats || typeof stats !== "object") return false;
    return ["ppg", "rpg", "apg", "spg", "bpg"].every((key, i) => {
      const value = stats[key];
      // Unrecorded steals/blocks are allowed; missing offense is not zero.
      if (value == null) return i >= 3;
      return Number.isFinite(Number(value)) && Number(value) >= 0 &&
        Number(value) <= [60, 40, 20, 6, 7][i];
    });
  }

  function buildReferenceStatsIndex(cells = REFERENCE_STATS_CELLS) {
    const index = new Map();
    for (const [team, era, players] of cells) {
      if (!ERAS.has(era)) continue;
      for (const [name, ppg, rpg, apg, spg, bpg] of players) {
        const stats = { ppg, rpg, apg, spg, bpg };
        if (!name || !usableReferenceStats(stats)) continue;
        const key = statContextKey(name, team, era);
        // Conflicting names that collapse to the same spelling are unsafe.
        if (index.has(key) && JSON.stringify(index.get(key)) !== JSON.stringify(stats))
          index.set(key, null);
        else if (!index.has(key)) index.set(key, stats);
      }
    }
    return index;
  }

  function recoverDealtStats(cell, sources, referenceIndex) {
    if (cell.squad.every(player => player.hasStats))
      return { ...cell, squad: cell.squad.map(player => ({ ...player, statsSource: "live" })) };
    const observed = new Map();
    for (const source of sources.values()) {
      if (!source?.hasStats || !usableReferenceStats(source.stats)) continue;
      const key = statContextKey(source.name || source.player,
        source.team || source.team_abbr, source.era);
      const previous = observed.get(key);
      if (!previous || (previous.statsSource === "reference" && source.statsSource !== "reference") ||
          ((previous.statsSource === "reference") === (source.statsSource === "reference") &&
            finiteNumber(source.statsObservedAt) > finiteNumber(previous.statsObservedAt)))
        observed.set(key, source);
    }
    return { ...cell, squad: cell.squad.map((player) => {
      if (player.hasStats) return { ...player, statsSource: "live" };
      const key = statContextKey(player.name || player.player,
        player.team || cell.team, player.era || cell.era);
      // The context index already prefers real observations, then newer ones.
      // A cached reference with the current ID must not hide a real Classic
      // observation saved under an older server ID for this exact peak.
      const cached = observed.get(key);
      const trustedCache = cached && cached.statsSource !== "reference";
      const reference = referenceIndex.get(key);
      const sameSnapshot = cached?.statsSource === "reference" &&
        cached.statsReferenceDate === REFERENCE_STATS_DATE;
      const fallback = trustedCache ? cached.stats : referenceIndex.has(key)
        ? reference : sameSnapshot ? cached.stats : null;
      if (!fallback) return { ...player };
      // Preserve any stats the current response did supply. The server's
      // player identity and eligibility always win over a reference row.
      const stats = { ...fallback };
      for (const key of ["ppg", "rpg", "apg", "spg", "bpg"]) {
        const value = player.stats?.[key];
        if (value != null && Number.isFinite(Number(value))) stats[key] = value;
      }
      if (!usableReferenceStats(stats)) return { ...player };
      return { ...player, stats, hasStats: true,
        statsSource: trustedCache ? "cached" : "reference",
        ...(trustedCache ? { statsObservedAt: cached.statsObservedAt } :
          { statsReferenceDate: REFERENCE_STATS_DATE }),
      };
    }) };
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
      const consider = (scope) => {
        if (forecasts[scope] !== null && forecasts[scope] > value + EPSILON) {
          kind = scope;
          value = forecasts[scope];
        }
      };
      for (const scope of ["team", "era"]) consider(scope);
      if (!best && kind === "pick") kind = team ? "team" : era ? "era" : "dead";
      const withoutPurchaseKind = kind;
      // Purchase-only controls are conditional quotes, not inventory. Compare
      // buying one retry now without pretending it can be saved for later or
      // that the user can afford it. Normal picks retain only usable retries.
      for (const scope of ["team", "era"]) {
        if (!retries[scope] && retries.purchase?.[scope]) {
          forecasts[scope] = this.retryExpectation(
            this.state(this.initialFamily, team, era).table, cell, scope);
          consider(scope);
        }
      }
      return { kind, withoutPurchaseKind, best, forecasts, sampleCount: this.pools.length,
        stealWeight: this.stealWeight, blockWeight: this.blockWeight };
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
        ...(source.statsSource ? { statsSource: source.statsSource,
          statsReferenceDate: source.statsReferenceDate } : {}),
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

  function lineupInstructionSteps(best) {
    if (!best?.row || !best.position) return [];
    return [
      ...(best.moves || []).map((move) =>
        `Move ${move.player} from ${move.from} to ${move.to} (empty).`),
      `Pick ${best.row.player} and place him at ${best.position}.`,
    ];
  }

  function retryAvailability(button, booster) {
    const status = (source, label, available = false, purchase = false) =>
      ({ source, label, available, purchase });
    // Buttons are locked during animations. Do not confuse that with spent
    // inventory, and rescan when disabled/aria-disabled changes.
    if (!button?.available) return status("unavailable", "not ready");
    if (!booster || typeof booster !== "object")
      return status("unknown", "available · check cost", true);
    const next = booster.next_use;
    if (next === "none") {
      // The official frontend leaves purchase controls active after the free
      // use is spent. Separate coin caps supersede max_per_draft on v4.
      const splitCaps = ["used_rv", "rv_per_draft", "used_coins", "coins_per_draft"]
        .some((key) => booster[key] !== undefined);
      const cap = splitCaps ? booster.coins_per_draft ?? booster.max_per_draft : booster.max_per_draft;
      const used = splitCaps ? booster.used_coins ?? 0 : booster.used_in_draft ?? 0;
      if (cap != null && Number(used) >= Number(cap))
        return status("unavailable", "retry limit reached");
      return status("purchase", "purchase option", false, true);
    }
    if (booster.enabled === false) return status("unavailable", "unavailable");
    if (next === "coins") return status("coins", "coins required", false, true);
    const source = ["free", "owned", "rv", "coins"].includes(next) ? next :
      Number(booster.free_left) > 0 ? "free" : Number(booster.owned_left) > 0 ? "owned" :
      Number(booster.rv_left) > 0 ? "rv" : "unknown";
    // Like the site's own readiness check, next_use is authoritative. Some
    // responses omit counters or retain older counters alongside a new source.
    return status(source, { free: "free", owned: "owned token", rv: "watch ad",
      coins: "coins required", unknown: "available · check cost" }[source], true);
  }

  function mergeRetryBoosters(current, payload) {
    const merged = { ...current };
    for (const root of [payload, payload?.data, payload?.cell, payload?.data?.cell]) {
      for (const key of ["respin_team", "respin_era"]) {
        const booster = root?.boosters?.[key];
        if (!booster || typeof booster !== "object" ||
            !["next_use", "free_left", "owned_left", "rv_left", "remaining", "enabled"]
              .some((field) => booster[field] !== undefined)) continue;
        // Partial counter updates must not erase the other scope, and startup
        // configuration (effect/currency only) must not erase live inventory.
        merged[key] = { ...merged[key], ...booster };
      }
    }
    return merged;
  }

  function expectedActionScore(action) {
    return action?.forecastRaw ?? action?.ceiling?.raw ?? -Infinity;
  }

  function chooseScoreAdvice(current, teamRetry, eraRetry, retries) {
    const retryScore = (retry) => retry?.reachableMeanRaw ??
      (retry?.exact ? retry.decisionRaw : null) ?? retry?.meanRaw ?? -Infinity;
    const legal = (retry) => retry && (retry.reachableLegal ?? retry.legalCount > 0);
    let bestRetry = null;
    for (const retry of [retries.team.available ? teamRetry : null,
      retries.era.available ? eraRetry : null]) {
      if (legal(retry) && (!bestRetry || retryScore(retry) > retryScore(bestRetry) + EPSILON))
        bestRetry = retry;
    }
    if (!current.best) return bestRetry
      ? { kind: bestRetry.scope, reason: "No legal player fits; retry to find a playable offer." }
      : { kind: "dead", reason: "No legal pick or retry is available." };
    if (bestRetry) {
      const gain = retryScore(bestRetry) - expectedActionScore(current.best);
      if (gain > EPSILON) return { kind: bestRetry.scope,
        reason: `This retry improves the expected final score by about ${gain.toFixed(1)} points.` };
    }
    return { kind: "pick", reason: "Picking now has the highest estimated final score." };
  }

  function liveExpectedFinalScore(advice, entries) {
    // In the last two rounds the planner's value is a complete-team increment
    // relative to the fixed roster. Earlier rounds use the same predicted
    // defense denominators as its additive model, not inflated partial scores.
    const value = advice.kind === "team" || advice.kind === "era"
      ? advice.forecasts[advice.kind] : advice.best?.value;
    if (!Number.isFinite(value)) return null;
    if (entries.length >= 3) return rawTeamScore(entries.map((entry) => entry.row)) + value;
    const { stealWeight, blockWeight } = advice;
    if (!Number.isFinite(stealWeight) || !Number.isFinite(blockWeight)) return null;
    return value + entries.reduce((sum, { row }) => sum + COEFF_PPG * row.ppg +
      COEFF_RPG * row.rpg + COEFF_APG * row.apg + stealWeight * row.spg + blockWeight * row.bpg, 0);
  }

  function live82Outlook(advice, entries, missing, history = []) {
    const forecast = missing > 0 && !advice.best ? null : liveExpectedFinalScore(advice, entries);
    // v4's record conversion is server-only. 110 is a planning reference, not
    // a verified threshold or a reason to declare mathematical impossibility.
    // Recent official v4 records can refine the reference; never use the old
    // legacy projectedWins curve or records from an unknown protocol.
    const observations = history.filter((entry) => entry?.protocol === "v4" &&
      ["classic", "hoopiq", "1v1"].includes(entry.mode) &&
      Number.isFinite(entry.score) && Number.isInteger(entry.wins) &&
      entry.wins >= 0 && entry.wins <= 82 &&
      Date.now() - entry.at >= 0 && Date.now() - entry.at < 7 * 24 * 60 * 60 * 1000);
    const perfect = observations.filter((entry) => entry.wins === 82).map((entry) => entry.score);
    const nonperfect = observations.filter((entry) => entry.wins < 82).map((entry) => entry.score);
    const low = nonperfect.length ? Math.max(...nonperfect) : null;
    const high = perfect.length ? Math.min(...perfect) : null;
    const contradictory = low !== null && high !== null && low >= high;
    const reference = !contradictory && high !== null ? high :
      Math.max(LIVE_82_BENCHMARK, !contradictory && low !== null ? low + 0.1 : 0);
    const calibrated = !contradictory && high !== null;
    const uncertain = missing > 0 || advice.sampleCount < 8 || !Number.isFinite(forecast) || contradictory;
    return {
      state: uncertain ? "uncertain" : forecast >= reference ? "promising" : "unlikely",
      label: uncertain ? "82-0 outlook uncertain" : forecast >= reference
        ? "82-0 likely possible · estimate" : "82-0 unlikely · estimate",
      forecast, reference,
      explanation: calibrated
        ? `Score outlook compared with ${reference.toFixed(1)}, a recent 82-0 result in this browser. Hidden future rolls make this an estimate, not a guarantee.`
        : `Score outlook compared with a ${reference.toFixed(1)}-point planning benchmark. The current server's exact 82-win cutoff is unverified; this is not a probability or proof of impossibility.`,
    };
  }

  function legacy82Outlook(advice, modelMismatch = false) {
    if (modelMismatch) return { state: "uncertain", label: "82-0 outlook uncertain", explanation: "The scoring model needs re-verification." };
    const proven = advice.seededPlan?.result || advice.priorCeiling;
    if (proven?.possible82 === false) return { state: "impossible", label: "82-0 impossible",
      explanation: "Even the complete-dataset/exact-plan score bound is below the verified legacy 82-win target." };
    if (advice.seededPlan?.result?.possible82) return { state: "promising", label: "82-0 achievable · exact plan",
      explanation: "The verified legacy seeded plan reaches 82 wins." };
    const retry = advice.kind === "team" ? advice.teamRetry : advice.kind === "era" ? advice.eraRetry : null;
    const rate = retry ? retry.pathRate : advice.current?.best?.forecastPathRate;
    const forecast = retry ? retry.meanRaw : advice.current?.best?.forecastRaw;
    const uncertain = !Number.isFinite(rate) && !Number.isFinite(forecast);
    const promising = Number.isFinite(rate) ? rate >= 0.5 : forecast >= TARGET_SCORE;
    return { state: uncertain ? "uncertain" : promising ? "promising" : "unlikely",
      label: uncertain ? "82-0 outlook uncertain" : promising ? "82-0 likely possible · estimate" : "82-0 unlikely · estimate",
      explanation: "Outlook uses the verified legacy curve and sampled future scores, independently of the bot's score. No sampled successes does not prove impossibility." };
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
    statContextKey,
    usableReferenceStats,
    buildReferenceStatsIndex,
    recoverDealtStats,
    referenceStatsCells: REFERENCE_STATS_CELLS,
    referenceStatsDate: REFERENCE_STATS_DATE,
    bestLivePick,
    livePriorPools,
    LiveDraftPlanner,
    livePlannerWorkerSource,
    clampPanelPosition,
    retryAvailability,
    mergeRetryBoosters,
    chooseScoreAdvice,
    compareForecastActions,
    liveExpectedFinalScore,
    live82Outlook,
    legacy82Outlook,
    FixedSlotDraftPlanner,
    rosterFamily,
    extendRosterFamily,
    positionMask,
    reachableRosterStates,
    shortestPlacementPlan,
    lineupInstructionSteps,
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
    const requestedSessionId = runtime.dealtSessionId;
    const requestedCellSeq = runtime.dealtCell?.seq;
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
        const isDealtState = /\/game-session\/api\/v(?:3|4)\/session\//i.test(response.url);
        let isVaultyApi = false;
        try {
          isVaultyApi =
            new URL(response.url).hostname === "api.vaultystudios.com";
        } catch (_) {}
        if (!isSeededStart && !isDealtState && !isVaultyApi)
          return;
        response
          .clone()
          .json()
          .then((payload) => {
            captureOfficialResult(payload);
            const isV4 = /\/api\/v4\//i.test(response.url);
            if (isDealtState && !isDealtStart && requestedSessionId &&
                requestedSessionId !== runtime.dealtSessionId) return;
            if (isDealtSpin) captureDealtSpin(payload, isV4);
            else if (isDealtStart) captureDealtSession(payload, isV4);
            else if (isSeededStart)
              captureStudioSession(payload, observedDatasetUrl);
            if (isDealtState && runtime.liveDataMode && runtime.dealtCell) {
              const seq = payload?.cell?.seq ?? payload?.seq;
              if (seq != null && Number(seq) < runtime.dealtCell.seq) return;
              if (seq == null && requestedCellSeq !== runtime.dealtCell.seq) return;
              const boosters = mergeRetryBoosters(runtime.dealtCell.boosters, payload);
              if (JSON.stringify(boosters) !== JSON.stringify(runtime.dealtCell.boosters)) {
                runtime.dealtCell.boosters = boosters;
                if (document.body) scheduleScan(0);
              }
            }
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
    referenceStatsIndex: null,
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
        protocol: runtime.liveDataMode ? "v4" : "legacy",
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
        .outlook { display:flex; align-items:center; gap:7px; margin:0 0 7px; font-size:10px; color:#c0cddd; }
        .retry-summary { display:flex; justify-content:space-between; gap:8px; margin-top:7px; color:#8da1ba; font-size:9px; }
        .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--status,#38bdf8); box-shadow:0 0 9px var(--status,#38bdf8); }
        .action { --action:#38bdf8; border:1px solid color-mix(in srgb,var(--action) 55%,#172337); background:color-mix(in srgb,var(--action) 10%,#07101e); border-radius:10px; padding:9px 10px; }
        .eyebrow { color:var(--action); font-size:9px; font-weight:900; letter-spacing:.11em; text-transform:uppercase; }
        .primary { margin-top:2px; display:flex; align-items:baseline; gap:6px; min-width:0; }
        .name { font-size:16px; line-height:1.12; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .arrow { color:#73869c; font-weight:700; }
        .position { color:#7dd3fc; font-size:15px; font-weight:900; }
        .sub { color:#9eafc2; font-size:10px; margin-top:4px; }
        .stats-reference { margin-top:7px; color:#8da1ba; font-size:9px; }
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
        .lineup-steps { margin:5px 0 0; padding-left:18px; font-size:10px; line-height:1.4; }
        .lineup-steps li { padding:2px 0; overflow-wrap:anywhere; }
        .lineup-steps li::marker { color:#7dd3fc; font-weight:800; }
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
      shadow.querySelector(".title").title = `82-0 Coach v${VERSION} · highest final score`;
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
    let cell = isV4 ? normalizeDealtCell(payload?.cell) : payload?.cell;
    if (!cell || !Number.isFinite(Number(cell.seq)) || !cell.team ||
        !ERAS.has(cell.era) || !Array.isArray(cell.squad)) return;
    if (runtime.dealtCell && Number(cell.seq) < runtime.dealtCell.seq) return;
    cancelLiveAnalysis();
    if (isV4) {
      if (!runtime.liveDataMode) restoreLiveRows();
      runtime.liveDataMode = true;
      runtime.dataReady = true;
      runtime.loadError = null;
      if (cell.squad.some(player => !player.hasStats))
        runtime.referenceStatsIndex ||= buildReferenceStatsIndex();
      cell = recoverDealtStats(cell, runtime.liveSources, runtime.referenceStatsIndex || new Map());
      for (const player of cell.squad) {
        if (player.statsSource === "live") player.statsObservedAt = Date.now();
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
      boosters: mergeRetryBoosters(runtime.dealtCell?.boosters, payload),
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

    // If real stats later supersede a reference for an already picked peak,
    // update that exact peak as well; never substitute another team or era.
    for (const tracked of runtime.tracked.values()) {
      const updated = runtime.byKey.get(tracked.row?.key);
      if (updated) tracked.row = updated;
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
    // Same score-first objective in Classic, Hoop IQ, and 1v1, including
    // legacy dataset-backed sessions. Bot-win/82-win rates are display only.
    const leftForecast = expectedActionScore(left);
    const rightForecast = expectedActionScore(right);
    if (Math.abs(leftForecast - rightForecast) > EPSILON)
      return leftForecast > rightForecast ? 1 : -1;
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
        available: Boolean(team && !team.disabled && team.getAttribute("aria-disabled") !== "true"),
      },
      era: { element: era || null,
        available: Boolean(era && !era.disabled && era.getAttribute("aria-disabled") !== "true") },
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
    return chooseScoreAdvice(current, teamRetry, eraRetry, retries);
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

  function renderLineupSteps(best) {
    if (!best?.moves?.length) return "";
    return `<div class="lineup-route"><div class="sub">Follow in order; each destination is empty at that step:</div>
      <ol class="lineup-steps" aria-label="Lineup move steps">${lineupInstructionSteps(best)
        .map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div>`;
  }

  function renderLiveAdvice(cell, entries, retries) {
    const rows = currentRowsForCell(cell);
    const missing = (runtime.dealtCell?.squad.length || 0) - rows.length;
    const referenceOffered = rows.filter(row => row.statsSource === "reference").length;
    const referencePicked = entries.filter(entry => entry.row.statsSource === "reference").length;
    const retryStates = Object.fromEntries(["team", "era"].map((scope) => [scope,
      retryAvailability(retries[scope], runtime.dealtCell?.boosters?.[`respin_${scope}`])]));
    const available = { team: retryStates.team.available, era: retryStates.era.available,
      purchase: { team: retryStates.team.purchase, era: retryStates.era.purchase } };
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
    // Unknown stats are not evidence of a bad/illegal offer. Do not spend free
    // retries just because no current player can be scored (common in Hoop IQ).
    const incompleteOffer = missing > 0 && !best;
    const isRetry = !incompleteOffer && (advice.kind === "team" || advice.kind === "era");
    const purchaseRetry = isRetry && retryStates[advice.kind].purchase;
    const move = !isRetry && best?.moves[0];
    const color = isRetry ? COLORS[advice.kind] : move ? COLORS.position : best ? COLORS.pick : COLORS.team;
    const target = runtime.oneVsOneOpponent?.score;
    const status = incompleteOffer ? "Stats needed to compare this roll" : Number.isFinite(target)
      ? `Highest-score planning · bot ${target.toFixed(1)}`
      : purchaseRetry ? "Optional purchase may improve score" :
        isRetry ? "Retry recommended before picking" : "Best modeled draft route";
    // An optional purchase must not improve the displayed outlook before the
    // user buys it. Keep that indicator on the best no-purchase route, which
    // may use a different free/owned retry rather than pick immediately.
    const outlook = live82Outlook(purchaseRetry ? { ...advice, kind: advice.withoutPurchaseKind } : advice,
      entries, missing, readResultHistory());
    const outlookColor = outlook.state === "promising" ? COLORS.pick :
      outlook.state === "unlikely" ? COLORS.team : COLORS.muted;
    const action = isRetry ? `Reroll ${advice.kind === "team" ? "TEAM" : "ERA"}` : move
      ? `${move.player} · ${move.from}`
      : best ? best.row.player
      : missing > 0 ? "Stats unavailable for this roll" : "No available player fits";
    const position = isRetry ? null : move?.to || best?.position;
    const route = isRetry
      ? purchaseRetry
        ? "Purchase required. Consider this only if you can afford it and want to spend coins; the best no-purchase option is below."
        : `${{ free: "Use your free retry", owned: "Use an owned retry token",
          rv: "Watch the site's ad to retry", coins: "Coins required for this retry",
          unknown: "Check the site's retry cost before proceeding" }[retryStates[advice.kind].source]}. Its estimated benefit outweighs saving it for later.`
      : move ? `Free ${best.position} for ${best.row.player} using the steps below.` : best
      ? `${best.row.ppg.toFixed(1)} PTS · ${best.row.rpg.toFixed(1)} REB · ${best.row.apg.toFixed(1)} AST · ${best.row.spg.toFixed(1)} STL · ${best.row.bpg.toFixed(1)} BLK`
      : missing > 0
        ? "No matching stats were found in this browser or the bundled reference. Current Classic rolls can fill missing peaks."
        : "Use an available retry to get a legal player.";
    const unknown = missing > 0
      ? `<div class="filter-hint">${missing} offered player${missing === 1 ? " has" : "s have"} unknown stats; ${best ? "this suggestion covers known players only" : "an accurate pick comparison is unavailable"}.</div>` : "";
    const referenceNotice = referenceOffered || referencePicked
      ? `<div class="stats-reference" title="Hoop IQ omits stats. These reference stats are matched by player, franchise, and era from the bundled ${REFERENCE_STATS_DATE} snapshot; current game and saved Classic stats take priority. Eligibility comes from the current game. They are reference values, not live server verification.">Reference stats · ${referenceOffered} offered${referencePicked ? ` · ${referencePicked} picked` : ""}</div>` : "";
    const finalRound = entries.length === 4;
    const noPurchaseRetry = ["team", "era"].includes(advice.withoutPurchaseKind)
      ? advice.withoutPurchaseKind : null;
    const fallbackText = purchaseRetry && noPurchaseRetry
      ? `Without buying: reroll ${noPurchaseRetry.toUpperCase()} (${retryStates[noPurchaseRetry].label}).`
      : best ? `${purchaseRetry ? "Without buying" : "If you prefer to pick"}: ${best.row.player} → ${best.position}.`
        : "Without buying: no known player in this offer fits your lineup.";
    const fallbackSteps = isRetry && best && !(purchaseRetry && noPurchaseRetry)
      ? renderLineupSteps(best) : "";
    const forecastText = (scope) => {
      const state = retryStates[scope];
      if (!state.available && !state.purchase) return state.label;
      const comparison = incompleteOffer ? "cannot compare without player stats" :
        advice.forecasts[scope] === null ? "not enough samples" :
        best ? `${(advice.forecasts[scope] - best.value) >= 0 ? "+" : ""}${(advice.forecasts[scope] - best.value).toFixed(1)} estimated score vs pick` : "retry to find a legal pick";
      return `${state.label} · ${comparison}${state.purchase ? " (if purchased)" : ""}`;
    };
    const compactRetryText = (scope) => {
      const state = retryStates[scope];
      if (!state.available && !state.purchase) return state.label;
      if (incompleteOffer) return `${state.label} · stats unknown`;
      if (advice.forecasts[scope] === null) return `${state.label} · insufficient data`;
      if (!best) return `${state.label} · find a legal pick`;
      const delta = advice.forecasts[scope] - best.value;
      const gain = Math.abs(delta) < 0.05 ? delta > EPSILON ? "+<0.1 pts" : "≈0 pts" :
        `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`;
      return `${state.label} · ${gain}`;
    };
    const details = readUiState().details ? `<div class="details">
      <div class="row"><span>Picked team</span><strong>${entries.length}/5</strong></div>
      <div class="row"><span>Players evaluated</span><strong>${rows.length}</strong></div>
      <div class="row"><span>Stats sources</span><strong>${rows.length - referenceOffered} game/cache · ${referenceOffered} reference${missing ? ` · ${missing} unknown` : ""}</strong></div>
      <div class="row"><span>Team retry</span><strong>${forecastText("team")}</strong></div>
      <div class="row"><span>Era retry</span><strong>${forecastText("era")}</strong></div>
      <div class="row"><span>Method</span><strong>Flexible-roster score planning</strong></div>
      <div class="row"><span>Objective · version</span><strong>Highest final score · ${VERSION}</strong></div>
      ${Number.isFinite(outlook.forecast) ? `<div class="row"><span>${purchaseRetry ? "Forecast without purchase" : "Estimated final score"}</span><strong>${outlook.forecast.toFixed(1)}</strong></div>` : ""}
      ${entries.length >= 3 ? '<div class="row"><span>Scoring</span><strong>Complete-team formula</strong></div>' : ""}
      <div class="row"><span>Planning samples</span><strong>${advice.sampleCount} team/era pools</strong></div>
      <div class="sub">${escapeHtml(outlook.explanation)}</div>
      <div class="sub">Retry gains compare using the next available retry now with picking and keeping it for later. Purchase options are conditional quotes for buying one retry now, not assumed inventory or affordability. The coach never buys, watches ads, or uses tokens for you. The bot's score never changes this score-first objective. Samples are estimates, not known future rolls.</div>
      </div>` : "";
    renderPanel(`<div class="status" style="--status:${color}"><span class="dot"></span><span>${escapeHtml(status)}</span></div>
      <div class="outlook" data-state="${outlook.state}" title="${escapeHtml(outlook.explanation)}" style="--status:${outlookColor}"><span class="dot"></span><span>${escapeHtml(outlook.label)}</span></div>
      <div class="action" style="--action:${color}"><div class="eyebrow">${purchaseRetry ? "CONSIDER RETRY" : isRetry ? "REROLL NOW" : move ? "MOVE FIRST" : best ? "PICK NOW" : "ROLL GUIDANCE"}</div>
      <div class="primary"><span class="name">${escapeHtml(action)}</span>${position ? `<span class="arrow">→</span><span class="position">${position}</span>` : ""}</div>
      <div class="sub">${escapeHtml(route)}</div>
      ${move ? renderLineupSteps(best) : ""}
      ${finalRound && best && !isRetry ? `<div class="metrics"><span>Calculated final score</span><strong>${best.result.score.toFixed(1)}</strong></div>` : ""}</div>
      ${unknown}${referenceNotice}${isRetry && (best || purchaseRetry) ? `<div class="${purchaseRetry ? "filter-hint" : "fallback"}">${escapeHtml(fallbackText)}${fallbackSteps}</div>` : ""}
      <div class="retry-summary" title="Estimated score change from retrying now. Purchase-option estimates apply only if you buy the retry; the coach does not assume you can afford it."><span>Team: ${compactRetryText("team")}</span><span>Era: ${compactRetryText("era")}</span></div>
      <button class="details-toggle" id="details-toggle">${readUiState().details ? "Hide details" : "Why this choice?"}</button>${details}`,
      `live:${analysisKey}:${JSON.stringify(retryStates)}:${advice.kind}:${best?.row.id}:${best?.position}:${JSON.stringify(best?.moves)}:${missing}:${referenceOffered}:${referencePicked}:${outlook.state}:${outlook.reference}:${readUiState().details}`);
  }

  function renderAdvice(advice, entries, cards, retries) {
    const ui = readUiState();
    const current = advice.current;
    const best = current.best;
    const outlook = legacy82Outlook(advice, runtime.modelMismatch);
    const outlookColor = outlook.state === "impossible" ? COLORS.impossible :
      outlook.state === "promising" ? COLORS.pick : outlook.state === "unlikely" ? COLORS.team : COLORS.muted;
    const seededResult = advice.seededPlan?.result || null;
    const isRetry = advice.kind === "team" || advice.kind === "era";
    const move = advice.kind === "pick" ? best?.moves?.[0] : null;
    const isOneVsOne = runtime.mode === "1v1";
    const opponentScore = runtime.oneVsOneOpponent?.score;
    const hasOpponentScore = Number.isFinite(opponentScore);
    const chosenRetry =
      advice.kind === "team"
        ? advice.teamRetry
        : advice.kind === "era"
          ? advice.eraRetry
          : null;
    const statusColor = runtime.modelMismatch
      ? COLORS.team
      : isRetry ? COLORS[advice.kind] : move ? COLORS.position : COLORS.pick;
    const statusText = runtime.modelMismatch
      ? "Site model changed — recommendations are provisional"
      : isOneVsOne && hasOpponentScore ? `Highest-score planning · bot ${opponentScore.toFixed(1)}`
      : seededResult ? `Exact highest-score plan · ${seededResult.score.toFixed(1)} points`
      : isRetry ? "Retry recommended before picking" : "Highest-score planning";
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
        ? `<div class="fallback">Best fallback if you override: <strong>${escapeHtml(best.row.player)} → ${best.position}</strong><br>${escapeHtml(stats)}${renderLineupSteps(best)}</div>`
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
          <div class="row"><span>Objective · version</span><strong>Highest final score · ${VERSION}</strong></div>
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
    const subline = move
      ? `Free ${best.position} for ${best.row.player} using the steps below.`
      : isRetry
        ? advice.reason
        : stats;
    const html = `
      <div class="status" style="--status:${statusColor}"><span class="dot"></span><span>${escapeHtml(statusText)}</span></div>
      <div class="outlook" data-state="${outlook.state}" title="${escapeHtml(outlook.explanation)}" style="--status:${outlookColor}"><span class="dot"></span><span>${escapeHtml(outlook.label)}</span></div>
      <div class="action" style="--action:${actionColor}">
        <div class="eyebrow">${eyebrow}</div>
        <div class="primary"><span class="name">${escapeHtml(primary)}</span>${position ? `<span class="arrow">→</span><span class="position">${position}</span>` : ""}</div>
        <div class="sub">${escapeHtml(subline)}</div>
        ${move ? renderLineupSteps(best) : ""}
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
      moves: best?.moves || [],
      outlook: outlook.state,
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
        ? "A selected player's exact peak has no matching stats. Current Classic rolls can fill gaps not covered by the bundled reference."
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
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "data-selectable", "aria-label",
        "data-position", "data-court-slot"],
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
