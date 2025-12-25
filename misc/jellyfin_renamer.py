#!/usr/bin/env python3
"""
Enhanced Jellyfin-compatible file renamer for torrented media
Supports movies and TV shows with proper naming conventions

Features:
- Smart media detection with API verification (TMDb)
- Comprehensive error handling and conflict resolution
- Undo functionality with operation logs
- Configuration file support
- Parallel processing for large directories
- Interactive preview mode
- Subtitle file handling
- NFO file generation
- Progress tracking with tqdm
"""

import os
import re
import sys
import time
import json
import shutil
import hashlib
import logging
import argparse
import requests
import multiprocessing
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from configparser import ConfigParser
import threading

# Optional dependencies
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    print("Note: Install 'tqdm' for progress bars: pip install tqdm")

# ANSI color codes
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    DIM = '\033[2m'

# Configuration defaults
DEFAULT_CONFIG = {
    'seerr': {
        'api_key': 'MTc2MTA4Nzk1MDQ1Mjg4OWVhMmFkLTE0ZmEtNDY3ZC1hZGFmLTUwY2JiNzI2MWFkZA==',
        'enabled': 'true',
        'base_url': 'http://192.168.1.130:5055',  # Default Overseerr/Jellyseerr port
        'type': 'overseerr',  # overseerr or jellyseerr
        'fallback_to_tmdb': 'true',
        'match_threshold': '0.8'  # Fuzzy matching threshold (0.0-1.0)
    },
    'processing': {
        'max_workers': '4',
        'min_file_size_mb': '10',
        'skip_samples': 'true',
        'handle_subtitles': 'true',
        'generate_nfo': 'false'
    },
    'renaming': {
        'conflict_resolution': 'skip',  # skip, increment, overwrite
        'rename_folders': 'true',
        'preserve_structure': 'false'
    },
    'patterns': {
        'custom_clean_patterns': '',
        'year_range_start': '1900',
        'year_range_end': '2030'
    },
    'logging': {
        'level': 'INFO',
        'log_to_file': 'true',
        'log_dir': './logs'
    }
}

@dataclass
class RenameOperation:
    """Record of a rename operation for undo functionality"""
    timestamp: str
    old_path: str
    new_path: str
    operation_type: str  # 'file' or 'folder'
    media_type: str  # 'movie' or 'tv'
    success: bool
    error: Optional[str] = None

@dataclass
class MediaInfo:
    """Information about a media file"""
    title: str
    year: Optional[str] = None
    season: Optional[int] = None
    episode: Optional[int] = None
    verified: bool = False
    tmdb_id: Optional[int] = None

def get_system_info() -> Dict[str, Any]:
    """Get system information for worker optimization"""
    info = {
        'cpu_count': multiprocessing.cpu_count(),
        'cpu_count_physical': None,
        'memory_total_gb': None,
        'memory_available_gb': None,
        'platform': sys.platform,
    }
    
    # Try to get physical CPU count and memory info
    try:
        import psutil
        info['cpu_count_physical'] = psutil.cpu_count(logical=False) or info['cpu_count']
        
        # Get memory info
        mem = psutil.virtual_memory()
        info['memory_total_gb'] = mem.total / (1024**3)
        info['memory_available_gb'] = mem.available / (1024**3)
    except ImportError:
        # psutil not available, estimate physical cores
        info['cpu_count_physical'] = info['cpu_count']
        # Can't get memory info without psutil
        pass
    
    return info

def calculate_optimal_workers(info: Optional[Dict[str, Any]] = None, 
                             conservative: bool = False,
                             aggressive: bool = False) -> int:
    """Calculate optimal number of workers based on system resources
    
    Args:
        info: System info dict (will auto-detect if None)
        conservative: Use conservative estimate (slower, safer)
        aggressive: Use aggressive estimate (faster, more resource intensive)
    
    Returns:
        Recommended number of workers
    """
    if info is None:
        info = get_system_info()
    
    cpu_count = info['cpu_count']
    physical_cores = info.get('cpu_count_physical') or cpu_count
    memory_available = info.get('memory_available_gb', 4)  # Default to 4GB if unknown
    
    # Start with physical cores (better for I/O bound tasks like file renaming)
    recommended = physical_cores
    
    # Adjust based on memory (assume ~500MB per worker for safety)
    max_workers_by_memory = int(memory_available / 0.5)
    
    # Use the lower of CPU-based or memory-based limit
    recommended = min(recommended, max_workers_by_memory)
    
    # Apply conservative or aggressive adjustments
    if conservative:
        recommended = max(1, recommended // 2)
    elif aggressive:
        recommended = min(cpu_count, recommended * 2)  # Can use hyperthreading
    
    # Ensure we have at least 1 worker and cap at 32 for safety
    recommended = max(1, min(32, recommended))
    
    return recommended

def get_worker_recommendations(info: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
    """Get conservative, balanced, and aggressive worker recommendations
    
    Returns:
        Dict with 'conservative', 'balanced', and 'aggressive' worker counts
    """
    if info is None:
        info = get_system_info()
    
    return {
        'conservative': calculate_optimal_workers(info, conservative=True),
        'balanced': calculate_optimal_workers(info),
        'aggressive': calculate_optimal_workers(info, aggressive=True),
    }

def colored(text: str, color: str) -> str:
    """Return colored text"""
    return f"{color}{text}{Colors.ENDC}"

def print_system_recommendations():
    """Print system recommendations in a nice table format"""
    info = get_system_info()
    recommendations = get_worker_recommendations(info)
    
    print_header("SYSTEM HARDWARE ANALYSIS")
    
    # Hardware specifications
    print(f"{colored('╔══════════════════════════════════════════════════════════════════╗', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {colored('HARDWARE SPECIFICATIONS', Colors.BOLD):^72} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('╠══════════════════════════════════════════════════════════════════╣', Colors.OKBLUE)}")
    
    # CPU Info
    print(f"{colored('║', Colors.OKBLUE)} {colored('CPU Information:', Colors.BOLD):30} {'':38} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)}   {'Logical Cores:':28} {info['cpu_count']:^4}{'':36} {colored('║', Colors.OKBLUE)}")
    if info['cpu_count_physical']:
        print(f"{colored('║', Colors.OKBLUE)}   {'Physical Cores:':28} {info['cpu_count_physical']:^4}{'':36} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)}   {'Platform:':28} {info['platform']:^10}{'':30} {colored('║', Colors.OKBLUE)}")
    
    # # Memory Info
    # if info.get('memory_total_gb'):
    #     print(f"{colored('║', Colors.OKBLUE)} {'':70} {colored('║', Colors.OKBLUE)}")
    #     print(f"{colored('║', Colors.OKBLUE)} {colored('Memory Information:', Colors.BOLD):30} {'':38} {colored('║', Colors.OKBLUE)}")
    #     memory_str = f"{info['memory_total_gb']:.1f} GB"
    #     print(
    #         f"{colored('║', Colors.OKBLUE)}   "
    #         f"{'Total Memory:':28} "
    #         f"{memory_str:^10}"
    #         f"{'':30} "
    #         f"{colored('║', Colors.OKBLUE)}"
    #     )
    #     if info.get('memory_available_gb'):
    #         available_memory_str = f"{info['memory_available_gb']:.1f} GB"
    #         print(
    #             f"{colored('║', Colors.OKBLUE)}   {'Available Memory:':28} "
    #             f"{available_memory_str:^10}"
    #             f"{'':30} {colored('║', Colors.OKBLUE)}"
    #         )
    
    print(f"{colored('╚══════════════════════════════════════════════════════════════════╝', Colors.OKBLUE)}")
    
    # Recommendations table
    print(f"\n{colored('╔══════════════════════════════════════════════════════════════════╗', Colors.OKGREEN)}")
    print(f"{colored('║', Colors.OKGREEN)} {colored('WORKER RECOMMENDATIONS', Colors.BOLD):^72} {colored('║', Colors.OKGREEN)}")
    print(f"{colored('╠══════════════════════════════════════════════════════════════════╣', Colors.OKGREEN)}")
    print(f"{colored('║', Colors.OKGREEN)} {'Profile':18} {'Workers':^10} {'Description':40} {colored('║', Colors.OKGREEN)}")
    print(f"{colored('╠══════════════════════════════════════════════════════════════════╣', Colors.OKGREEN)}")
    
    # Conservative
    print(f"{colored('║', Colors.OKGREEN)} {colored('Conservative', Colors.OKCYAN):18} "
          f"{colored(str(recommendations['conservative']), Colors.BOLD):^10} "
          f"{'Safest, lower resource usage':40} {colored('║', Colors.OKGREEN)}")
    
    # Balanced
    print(f"{colored('║', Colors.OKGREEN)} {colored('Balanced', Colors.OKGREEN):18} "
          f"{colored(str(recommendations['balanced']), Colors.BOLD):^10} "
          f"{'Recommended for most cases':40} {colored('║', Colors.OKGREEN)}")
    
    # Aggressive
    print(f"{colored('║', Colors.OKGREEN)} {colored('Aggressive', Colors.WARNING):18} "
          f"{colored(str(recommendations['aggressive']), Colors.BOLD):^10} "
          f"{'Fastest, higher resource usage':40} {colored('║', Colors.OKGREEN)}")
    
    print(f"{colored('╚══════════════════════════════════════════════════════════════════╝', Colors.OKGREEN)}")
    
    # Usage examples
    print(f"\n{colored('╔══════════════════════════════════════════════════════════════════╗', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {colored('USAGE EXAMPLES', Colors.BOLD):^72} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('╠══════════════════════════════════════════════════════════════════╣', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {'':70} {colored('║', Colors.OKBLUE)}")
    
    # Example 1
    print(f"{colored('║', Colors.OKBLUE)} {colored('Using balanced workers (recommended):', Colors.BOLD):68} {colored('║', Colors.OKBLUE)}")
    example_cmd = f"./rename.py /media/movies --workers {recommendations['balanced']}"
    print(f"{colored('║', Colors.OKBLUE)}   {colored(example_cmd, Colors.DIM):66} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {'':70} {colored('║', Colors.OKBLUE)}")
    
    # Example 2
    print(f"{colored('║', Colors.OKBLUE)} {colored('With type specification:', Colors.BOLD):68} {colored('║', Colors.OKBLUE)}")
    example_cmd2 = f"./rename.py /media/movies --type movie --workers {recommendations['balanced']}"
    print(f"{colored('║', Colors.OKBLUE)}   {colored(example_cmd2, Colors.DIM):66} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {'':70} {colored('║', Colors.OKBLUE)}")
    
    # Example 3
    print(f"{colored('║', Colors.OKBLUE)} {colored('Dry run with aggressive workers:', Colors.BOLD):68} {colored('║', Colors.OKBLUE)}")
    example_cmd3 = f"./rename.py /media --workers {recommendations['aggressive']} --dry-run"
    print(f"{colored('║', Colors.OKBLUE)}   {colored(example_cmd3, Colors.DIM):66} {colored('║', Colors.OKBLUE)}")
    print(f"{colored('║', Colors.OKBLUE)} {'':70} {colored('║', Colors.OKBLUE)}")
    
    print(f"{colored('╚══════════════════════════════════════════════════════════════════╝', Colors.OKBLUE)}")
    
    # Notes
    if not info.get('memory_total_gb'):
        print(f"\n{colored('💡 TIP:', Colors.WARNING)} Install 'psutil' for more accurate recommendations:")
        print(f"   {colored('pip install psutil', Colors.DIM)}")
    
    print()

class Config:
    """Configuration management"""
    def __init__(self, config_file: Optional[Path] = None):
        self.config = ConfigParser()
        self.config.read_dict(DEFAULT_CONFIG)
        self.config_file = config_file or Path.home() / '.jellyfin_renamer.ini'
        
        if self.config_file.exists():
            self.config.read(self.config_file)
    
    def save(self):
        """Save current configuration to file"""
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_file, 'w') as f:
            self.config.write(f)
    
    def get(self, section: str, key: str, fallback: Any = None) -> str:
        """Get configuration value"""
        return self.config.get(section, key, fallback=fallback)
    
    def getint(self, section: str, key: str, fallback: int = 0) -> int:
        """Get integer configuration value"""
        return self.config.getint(section, key, fallback=fallback)
    
    def getboolean(self, section: str, key: str, fallback: bool = False) -> bool:
        """Get boolean configuration value"""
        return self.config.getboolean(section, key, fallback=fallback)

class Logger:
    """Enhanced logging with file and console output"""
    def __init__(self, config: Config, verbose: bool = False, quiet: bool = False):
        self.config = config
        self.verbose = verbose
        self.quiet = quiet
        self.logger = logging.getLogger('jellyfin_renamer')
        
        # Set level based on verbosity
        if verbose:
            level = logging.DEBUG
        elif quiet:
            level = logging.WARNING
        else:
            level_name = config.get('logging', 'level', 'INFO')
            level = getattr(logging, level_name, logging.INFO)
        
        self.logger.setLevel(level)
        self.logger.handlers = []  # Clear existing handlers
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(level)
        console_formatter = logging.Formatter('%(message)s')
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)
        
        # File handler
        if config.getboolean('logging', 'log_to_file'):
            log_dir = Path(config.get('logging', 'log_dir', './logs'))
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / f'jellyfin_renamer_{datetime.now():%Y%m%d_%H%M%S}.log'
            
            file_handler = logging.FileHandler(log_file)
            file_handler.setLevel(logging.DEBUG)
            file_formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(file_formatter)
            self.logger.addHandler(file_handler)
    
    def debug(self, msg: str):
        self.logger.debug(msg)
    
    def info(self, msg: str):
        self.logger.info(msg)
    
    def warning(self, msg: str):
        self.logger.warning(msg)
    
    def error(self, msg: str):
        self.logger.error(msg)
    
    def critical(self, msg: str):
        self.logger.critical(msg)

class OperationLog:
    """Log all rename operations for undo functionality"""
    def __init__(self, log_dir: Path):
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.current_log_file = self.log_dir / f'operations_{datetime.now():%Y%m%d_%H%M%S}.json'
        self.operations: List[RenameOperation] = []
        self.lock = threading.Lock()
    
    def add_operation(self, operation: RenameOperation):
        """Add an operation to the log"""
        with self.lock:
            self.operations.append(operation)
            self._save()
    
    def _save(self):
        """Save operations to JSON file"""
        with open(self.current_log_file, 'w') as f:
            json.dump([asdict(op) for op in self.operations], f, indent=2)
    
    @classmethod
    def load_log(cls, log_file: Path) -> List[RenameOperation]:
        """Load operations from a log file"""
        with open(log_file, 'r') as f:
            data = json.load(f)
            return [RenameOperation(**op) for op in data]
    
    def undo_operations(self, logger: Logger) -> Tuple[int, int]:
        """Undo all operations in this log"""
        success_count = 0
        error_count = 0
        
        # Reverse order for undo (folders before files)
        for operation in reversed(self.operations):
            if not operation.success:
                continue
            
            old_path = Path(operation.old_path)
            new_path = Path(operation.new_path)
            
            if not new_path.exists():
                logger.warning(f"Cannot undo: {new_path} does not exist")
                error_count += 1
                continue
            
            if old_path.exists():
                logger.warning(f"Cannot undo: {old_path} already exists")
                error_count += 1
                continue
            
            try:
                os.rename(new_path, old_path)
                logger.info(f"✓ Undone: {new_path.name} → {old_path.name}")
                success_count += 1
            except Exception as e:
                logger.error(f"✗ Failed to undo {new_path.name}: {e}")
                error_count += 1
        
        return success_count, error_count

class SeerrAPI:
    """Seerr (Overseerr/Jellyseerr) API integration for media verification and request matching"""
    
    def __init__(self, api_key: str, base_url: str, seerr_type: str = 'overseerr'):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.seerr_type = seerr_type
        self.session = requests.Session()
        self.session.headers.update({
            'X-Api-Key': api_key,
            'Content-Type': 'application/json'
        })
        self.cache = {}
        self._user_requests = None
        self._all_media = None
    
    def _make_request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict]:
        """Make API request with caching"""
        cache_key = f"{endpoint}:{json.dumps(params or {}, sort_keys=True)}"
        
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            url = f"{self.base_url}/api/v1/{endpoint}"
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            self.cache[cache_key] = data
            return data
        except requests.RequestException as e:
            return None
    
    def get_user_requests(self, force_refresh: bool = False) -> List[Dict]:
        """Get all user requests from Seerr"""
        if self._user_requests and not force_refresh:
            return self._user_requests
        
        all_requests = []
        
        try:
            # Get movie requests
            movie_data = self._make_request('request', {'filter': 'all', 'sort': 'added'})
            if movie_data and 'results' in movie_data:
                all_requests.extend(movie_data['results'])
            
            # Fetch additional pages if needed
            if movie_data and movie_data.get('pageInfo', {}).get('pages', 1) > 1:
                for page in range(2, movie_data['pageInfo']['pages'] + 1):
                    page_data = self._make_request('request', {'filter': 'all', 'sort': 'added', 'skip': (page - 1) * 20})
                    if page_data and 'results' in page_data:
                        all_requests.extend(page_data['results'])
            
            self._user_requests = all_requests
            return all_requests
        except Exception as e:
            return []
    
    def get_media_info(self, media_type: str, tmdb_id: int) -> Optional[Dict]:
        """Get detailed media information from Seerr"""
        endpoint = f"{media_type}/{tmdb_id}"
        return self._make_request(endpoint)
    
    def search_media(self, query: str, media_type: str = 'movie') -> List[Dict]:
        """Search for media in Seerr"""
        endpoint = 'search'
        params = {'query': query, 'page': 1}
        
        data = self._make_request(endpoint, params)
        
        if data and 'results' in data:
            # Filter by media type
            if media_type == 'movie':
                return [r for r in data['results'] if r.get('mediaType') == 'movie']
            elif media_type == 'tv':
                return [r for r in data['results'] if r.get('mediaType') == 'tv']
            return data['results']
        
        return []
    
    def fuzzy_match_title(self, search_title: str, candidate_title: str, threshold: float = 0.8) -> float:
        """Calculate fuzzy match score between two titles"""
        # Simple fuzzy matching using character overlap
        search_lower = search_title.lower().strip()
        candidate_lower = candidate_title.lower().strip()
        
        # Exact match
        if search_lower == candidate_lower:
            return 1.0
        
        # Contains match
        if search_lower in candidate_lower or candidate_lower in search_lower:
            shorter = min(len(search_lower), len(candidate_lower))
            longer = max(len(search_lower), len(candidate_lower))
            return shorter / longer
        
        # Character overlap
        search_chars = set(search_lower.replace(' ', ''))
        candidate_chars = set(candidate_lower.replace(' ', ''))
        
        if not search_chars or not candidate_chars:
            return 0.0
        
        overlap = len(search_chars & candidate_chars)
        total = len(search_chars | candidate_chars)
        
        return overlap / total if total > 0 else 0.0
    
    def find_matching_request(self, title: str, year: Optional[str] = None, 
                            media_type: str = 'movie', threshold: float = 0.8) -> Optional[Dict]:
        """Find a matching request in the user's Seerr requests"""
        requests = self.get_user_requests()
        
        best_match = None
        best_score = 0.0
        
        for request in requests:
            # Check media type
            request_media = request.get('media', {})
            request_type = request.get('type')
            
            if media_type == 'movie' and request_type != 'movie':
                continue
            if media_type == 'tv' and request_type != 'tv':
                continue
            
            # Get title from request
            if request_type == 'movie':
                request_title = request_media.get('title', '')
                request_year = request_media.get('releaseDate', '')[:4] if request_media.get('releaseDate') else None
            else:  # TV
                request_title = request_media.get('name', '')
                request_year = request_media.get('firstAirDate', '')[:4] if request_media.get('firstAirDate') else None
            
            # Calculate match score
            title_score = self.fuzzy_match_title(title, request_title, threshold)
            
            # Boost score if years match
            if year and request_year and year == request_year:
                title_score = min(1.0, title_score * 1.2)
            elif year and request_year and year != request_year:
                title_score *= 0.7  # Penalize year mismatch
            
            if title_score > best_score and title_score >= threshold:
                best_score = title_score
                best_match = request
        
        return best_match
    
    def verify_movie(self, title: str, year: Optional[str] = None, threshold: float = 0.8) -> Tuple[bool, Optional[Dict]]:
        """Verify a movie against Seerr requests and media database"""
        # First, check user requests
        request_match = self.find_matching_request(title, year, 'movie', threshold)
        
        if request_match:
            media = request_match.get('media', {})
            return True, {
                'title': media.get('title', title),
                'release_date': media.get('releaseDate', ''),
                'overview': media.get('overview', ''),
                'id': media.get('tmdbId'),
                'vote_average': media.get('voteAverage'),
                'source': 'seerr_request',
                'request_status': request_match.get('status'),
                'match_score': 1.0
            }
        
        # If not in requests, search Seerr's media database
        search_results = self.search_media(title, 'movie')
        
        if search_results:
            best_match = None
            best_score = 0.0
            
            for result in search_results[:5]:  # Check top 5 results
                result_title = result.get('title', '')
                result_year = result.get('releaseDate', '')[:4] if result.get('releaseDate') else None
                
                score = self.fuzzy_match_title(title, result_title, threshold)
                
                # Boost for year match
                if year and result_year and year == result_year:
                    score = min(1.0, score * 1.2)
                elif year and result_year and year != result_year:
                    score *= 0.7
                
                if score > best_score and score >= threshold:
                    best_score = score
                    best_match = result
            
            if best_match:
                return True, {
                    'title': best_match.get('title', title),
                    'release_date': best_match.get('releaseDate', ''),
                    'overview': best_match.get('overview', ''),
                    'id': best_match.get('id'),
                    'vote_average': best_match.get('voteAverage'),
                    'source': 'seerr_search',
                    'match_score': best_score
                }
        
        return False, None
    
    def verify_tv(self, title: str, threshold: float = 0.8) -> Tuple[bool, Optional[Dict]]:
        """Verify a TV show against Seerr requests and media database"""
        # First, check user requests
        request_match = self.find_matching_request(title, None, 'tv', threshold)
        
        if request_match:
            media = request_match.get('media', {})
            return True, {
                'name': media.get('name', title),
                'first_air_date': media.get('firstAirDate', ''),
                'overview': media.get('overview', ''),
                'id': media.get('tmdbId'),
                'vote_average': media.get('voteAverage'),
                'source': 'seerr_request',
                'request_status': request_match.get('status'),
                'match_score': 1.0
            }
        
        # If not in requests, search Seerr's media database
        search_results = self.search_media(title, 'tv')
        
        if search_results:
            best_match = None
            best_score = 0.0
            
            for result in search_results[:5]:
                result_title = result.get('name', '')
                score = self.fuzzy_match_title(title, result_title, threshold)
                
                if score > best_score and score >= threshold:
                    best_score = score
                    best_match = result
            
            if best_match:
                return True, {
                    'name': best_match.get('name', title),
                    'first_air_date': best_match.get('firstAirDate', ''),
                    'overview': best_match.get('overview', ''),
                    'id': best_match.get('id'),
                    'vote_average': best_match.get('voteAverage'),
                    'source': 'seerr_search',
                    'match_score': best_score
                }
        
        return False, None
    
    def get_request_stats(self) -> Dict[str, int]:
        """Get statistics about user requests"""
        requests = self.get_user_requests()
        
        stats = {
            'total': len(requests),
            'pending': 0,
            'approved': 0,
            'available': 0,
            'movies': 0,
            'tv': 0
        }
        
        for request in requests:
            status = request.get('status', 0)
            req_type = request.get('type', '')
            
            if status == 1:
                stats['pending'] += 1
            elif status == 2:
                stats['approved'] += 1
            elif status == 3:
                stats['available'] += 1
            
            if req_type == 'movie':
                stats['movies'] += 1
            elif req_type == 'tv':
                stats['tv'] += 1
        
        return stats

def print_header(text: str):
    """Print a formatted header"""
    print(f"\n{colored('═' * 70, Colors.OKBLUE)}")
    print(colored(f"  {text}", Colors.BOLD + Colors.OKBLUE))
    print(f"{colored('═' * 70, Colors.OKBLUE)}\n")

def validate_path(path: str, base_dir: Path) -> bool:
    """Validate path to prevent path traversal attacks"""
    try:
        resolved = Path(path).resolve()
        base_resolved = base_dir.resolve()
        return str(resolved).startswith(str(base_resolved))
    except Exception:
        return False

def is_sample_file(filepath: Path, min_size_mb: int = 10) -> bool:
    """Detect if a file is a sample based on size and name"""
    size_mb = filepath.stat().st_size / (1024 * 1024)
    
    if size_mb < min_size_mb:
        return True
    
    if 'sample' in filepath.name.lower():
        return True
    
    return False

class PatternCleaner:
    """Clean filenames using regex patterns"""
    
    # Compiled patterns for performance
    QUALITY_PATTERNS = [
        re.compile(r'[\._\-](?:1080p|2160p|720p|480p|4K|UHD)', re.IGNORECASE),
        re.compile(r'[\._\-](?:BluRay|BrRip|WEB-?DL|WEBRip|HDRip|DVDRip|HDTV|REMUX)', re.IGNORECASE),
        re.compile(r'[\._\-](?:x264|x265|h264|h265|HEVC|AVC)', re.IGNORECASE),
        re.compile(r'[\._\-](?:AAC|AC3|DTS|TrueHD|FLAC|Atmos)', re.IGNORECASE),
        re.compile(r'[\._\-](?:DTS-HD)', re.IGNORECASE),
        re.compile(r'[\._\-](?:MA)(?:[\._\-]|\s|$)', re.IGNORECASE),
        re.compile(r'[\._\-](?:HD)(?:[\._\-]|\s|$)', re.IGNORECASE),
        re.compile(r'[\._\-](?:5\.1|7\.1|2\.0|5\s1|7\s1|2\s0)', re.IGNORECASE),
        re.compile(r'[\._\-](?:NORDiC|NORDIC)', re.IGNORECASE),
        re.compile(r'[\._\-](?:ENG|ESP|LATINO|MULTi)', re.IGNORECASE),
        re.compile(r'[\._\-](?:Master|Remastered)', re.IGNORECASE),
        re.compile(r'[\._\-](?:DDP5\.1|DD\+5\.1)', re.IGNORECASE),
        re.compile(r'[\._\-](?:DV|HDR|SDR|HDR10|HDR10\+)', re.IGNORECASE),
        re.compile(r'[\._\-](?:PROPER|REPACK|INTERNAL)', re.IGNORECASE),
        re.compile(r'-[A-Z0-9]+$'),
    ]
    
    BRACKET_PATTERNS = [
        re.compile(r'\[.*?\]'),
        re.compile(r'\((?!(?:19|20)\d{2}\)).*?\)'),  # Remove parentheses except for years
    ]
    
    OTHER_PATTERNS = [
        re.compile(r'www\.\S+\s*-\s*'),  # Remove "www.site.com - " prefixes
        re.compile(r'\.(?:mkv|mp4|avi|mov|m4v|wmv)$', re.IGNORECASE),
    ]
    
    def __init__(self, custom_patterns: Optional[List[str]] = None):
        self.custom_patterns = []
        if custom_patterns:
            for pattern in custom_patterns:
                try:
                    self.custom_patterns.append(re.compile(pattern, re.IGNORECASE))
                except re.error:
                    pass  # Skip invalid patterns
    
    def clean(self, name: str) -> str:
        """Clean filename of common torrent artifacts"""
        cleaned = name
        
        # Apply all pattern categories
        for pattern in (self.QUALITY_PATTERNS + self.BRACKET_PATTERNS + 
                       self.OTHER_PATTERNS + self.custom_patterns):
            cleaned = pattern.sub(' ', cleaned)
        
        # Remove empty parentheses (multiple passes for nested)
        while re.search(r'\(\s*\)', cleaned):
            cleaned = re.sub(r'\(\s*\)', '', cleaned)
        
        # Clean up multiple spaces and trim
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned

class MediaParser:
    """Parse media information from filenames"""
    
    # TV show patterns
    TV_PATTERNS = [
        re.compile(r'[Ss](\d{1,2})[Ee](\d{1,2})(?:-?[Ee](\d{1,2}))?'),  # S01E01 or S01E01-E02
        re.compile(r'(\d{1,2})x(\d{1,2})'),  # 1x01
        re.compile(r'[Ss]eason[\._\s]*(\d{1,2})[\._\s]*[Ee]pisode[\._\s]*(\d{1,2})', re.IGNORECASE),
    ]
    
    # Year pattern
    YEAR_PATTERN = re.compile(r'\b(19\d{2}|20\d{2})\b')
    
    # Movie format pattern
    MOVIE_FORMAT = re.compile(r'^(.+?)\s*\((\d{4})\)$')
    
    # TV format pattern
    TV_FORMAT = re.compile(r'^(.+?)\s+S(\d{2})E(\d{2})$', re.IGNORECASE)
    
    def __init__(self, cleaner: PatternCleaner, year_range: Tuple[int, int] = (1900, 2030)):
        self.cleaner = cleaner
        self.year_range = year_range
    
    def is_valid_year(self, year: str) -> bool:
        """Check if year is within valid range"""
        try:
            year_int = int(year)
            return self.year_range[0] <= year_int <= self.year_range[1]
        except ValueError:
            return False
    
    def extract_movie_info(self, filename: str) -> MediaInfo:
        """Extract movie title and year from filename"""
        # Check if already in correct format
        correct_format = self.MOVIE_FORMAT.match(filename)
        if correct_format:
            title = correct_format.group(1).strip()
            year = correct_format.group(2)
            if self.is_valid_year(year):
                return MediaInfo(title=title, year=year)
        
        # Check for malformed formats
        malformed_with_year = re.match(r'^(.+?)\s*\(\s*\(\s*(\d{4})\)$', filename)
        if malformed_with_year:
            title = malformed_with_year.group(1).strip()
            year = malformed_with_year.group(2)
            if self.is_valid_year(year):
                return MediaInfo(title=title, year=year)
        
        malformed_empty = re.match(r'^(.+?)\s*\(\s*\($', filename)
        if malformed_empty:
            title = malformed_empty.group(1).strip()
            year_match = self.YEAR_PATTERN.search(title)
            if year_match and self.is_valid_year(year_match.group(1)):
                year = year_match.group(1)
                title = title[:year_match.start()].strip()
                return MediaInfo(title=title, year=year)
            return MediaInfo(title=title)
        
        # Extract year from anywhere in filename
        years = self.YEAR_PATTERN.findall(filename)
        valid_years = [y for y in years if self.is_valid_year(y)]
        
        if valid_years:
            # Use the first valid year
            year = valid_years[0]
            year_match = self.YEAR_PATTERN.search(filename)
            title = filename[:year_match.start()]
            title = self.cleaner.clean(title)
            title = re.sub(r'[\._]+', ' ', title).strip()
            
            if not title:
                title = self.cleaner.clean(filename)
                title = re.sub(r'[\._]+', ' ', title).strip()
                title = re.sub(r'\b' + year + r'\b', '', title).strip()
            
            return MediaInfo(title=title, year=year)
        else:
            title = self.cleaner.clean(filename)
            title = re.sub(r'[\._]+', ' ', title).strip()
            return MediaInfo(title=title)
    
    def extract_tv_info(self, filename: str) -> MediaInfo:
        """Extract TV show info: title, season, episode"""
        # Check if already in correct format
        correct_format = self.TV_FORMAT.match(filename)
        if correct_format:
            return MediaInfo(
                title=correct_format.group(1).strip(),
                season=int(correct_format.group(2)),
                episode=int(correct_format.group(3))
            )
        
        # Try various patterns
        for pattern in self.TV_PATTERNS:
            match = pattern.search(filename)
            if match:
                season = int(match.group(1))
                episode = int(match.group(2))
                
                # Check for multi-episode
                end_episode = None
                if len(match.groups()) > 2 and match.group(3):
                    end_episode = int(match.group(3))
                
                title = filename[:match.start()]
                title = self.cleaner.clean(title)
                title = re.sub(r'[\._]+', ' ', title).strip()
                
                return MediaInfo(
                    title=title,
                    season=season,
                    episode=episode
                )
        
        return MediaInfo(title="")

class ConflictResolver:
    """Handle filename conflicts"""
    
    @staticmethod
    def resolve(target_path: Path, strategy: str = 'skip') -> Optional[Path]:
        """Resolve filename conflict based on strategy"""
        if not target_path.exists():
            return target_path
        
        if strategy == 'skip':
            return None
        elif strategy == 'overwrite':
            return target_path
        elif strategy == 'increment':
            base = target_path.stem
            ext = target_path.suffix
            parent = target_path.parent
            counter = 1
            
            while True:
                new_path = parent / f"{base} ({counter}){ext}"
                if not new_path.exists():
                    return new_path
                counter += 1
        
        return None

class SubtitleHandler:
    """Handle subtitle files alongside video files"""
    
    SUBTITLE_EXTENSIONS = {'.srt', '.sub', '.idx', '.ssa', '.ass', '.vtt'}
    
    @staticmethod
    def find_subtitles(video_path: Path) -> List[Path]:
        """Find subtitle files for a video file"""
        subtitles = []
        parent = video_path.parent
        base_name = video_path.stem
        
        for sub_ext in SubtitleHandler.SUBTITLE_EXTENSIONS:
            # Exact match
            exact_match = parent / f"{base_name}{sub_ext}"
            if exact_match.exists():
                subtitles.append(exact_match)
            
            # Language variants (e.g., movie.en.srt)
            for lang_file in parent.glob(f"{base_name}.*{sub_ext}"):
                if lang_file not in subtitles:
                    subtitles.append(lang_file)
        
        return subtitles
    
    @staticmethod
    def rename_subtitles(old_video_path: Path, new_video_path: Path, 
                        subtitles: List[Path], logger: Logger) -> List[Tuple[Path, Path]]:
        """Rename subtitle files to match new video name"""
        renamed = []
        old_base = old_video_path.stem
        new_base = new_video_path.stem
        
        for sub_path in subtitles:
            # Preserve language codes and extensions
            sub_name = sub_path.name
            new_sub_name = sub_name.replace(old_base, new_base, 1)
            new_sub_path = sub_path.parent / new_sub_name
            
            try:
                os.rename(sub_path, new_sub_path)
                renamed.append((sub_path, new_sub_path))
                logger.debug(f"Renamed subtitle: {sub_path.name} → {new_sub_name}")
            except Exception as e:
                logger.warning(f"Failed to rename subtitle {sub_path.name}: {e}")
        
        return renamed

class NFOGenerator:
    """Generate NFO files for Jellyfin"""
    
    @staticmethod
    def generate_movie_nfo(media_info: MediaInfo, tmdb_data: Optional[Dict] = None) -> str:
        """Generate movie NFO content"""
        nfo = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
        nfo.append('<movie>')
        
        if tmdb_data:
            nfo.append(f'  <title>{tmdb_data.get("title", media_info.title)}</title>')
            if tmdb_data.get('overview'):
                nfo.append(f'  <plot>{tmdb_data["overview"]}</plot>')
            if tmdb_data.get('release_date'):
                nfo.append(f'  <year>{tmdb_data["release_date"][:4]}</year>')
            if tmdb_data.get('id'):
                nfo.append(f'  <tmdbid>{tmdb_data["id"]}</tmdbid>')
            if tmdb_data.get('vote_average'):
                nfo.append(f'  <rating>{tmdb_data["vote_average"]}</rating>')
        else:
            nfo.append(f'  <title>{media_info.title}</title>')
            if media_info.year:
                nfo.append(f'  <year>{media_info.year}</year>')
        
        nfo.append('</movie>')
        return '\n'.join(nfo)
    
    @staticmethod
    def generate_tv_nfo(media_info: MediaInfo, tmdb_data: Optional[Dict] = None) -> str:
        """Generate TV show NFO content"""
        nfo = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
        nfo.append('<tvshow>')
        
        if tmdb_data:
            nfo.append(f'  <title>{tmdb_data.get("name", media_info.title)}</title>')
            if tmdb_data.get('overview'):
                nfo.append(f'  <plot>{tmdb_data["overview"]}</plot>')
            if tmdb_data.get('first_air_date'):
                nfo.append(f'  <year>{tmdb_data["first_air_date"][:4]}</year>')
            if tmdb_data.get('id'):
                nfo.append(f'  <tmdbid>{tmdb_data["id"]}</tmdbid>')
        else:
            nfo.append(f'  <title>{media_info.title}</title>')
        
        nfo.append('</tvshow>')
        return '\n'.join(nfo)

class MediaRenamer:
    """Main class for renaming media files"""
    
    VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm'}
    
    def __init__(self, config: Config, logger: Logger, operation_log: OperationLog,
                 seerr_api: Optional[SeerrAPI] = None):
        self.config = config
        self.logger = logger
        self.operation_log = operation_log
        self.seerr_api = seerr_api
        
        # Initialize components
        custom_patterns = []
        pattern_str = config.get('patterns', 'custom_clean_patterns', '')
        if pattern_str:
            custom_patterns = [p.strip() for p in pattern_str.split(',') if p.strip()]
        
        year_start = config.getint('patterns', 'year_range_start', 1900)
        year_end = config.getint('patterns', 'year_range_end', 2030)
        
        self.cleaner = PatternCleaner(custom_patterns)
        self.parser = MediaParser(self.cleaner, (year_start, year_end))
        self.subtitle_handler = SubtitleHandler()
        self.nfo_generator = NFOGenerator()
        
        # Settings
        self.min_file_size_mb = config.getint('processing', 'min_file_size_mb', 10)
        self.skip_samples = config.getboolean('processing', 'skip_samples', True)
        self.handle_subtitles = config.getboolean('processing', 'handle_subtitles', True)
        self.generate_nfo = config.getboolean('processing', 'generate_nfo', False)
        self.conflict_resolution = config.get('renaming', 'conflict_resolution', 'skip')
        self.match_threshold = float(config.get('seerr', 'match_threshold', '0.8'))
    
    def verify_with_seerr(self, media_info: MediaInfo, media_type: str) -> Tuple[bool, Optional[Dict]]:
        """Verify media information with Seerr"""
        if not self.seerr_api:
            return False, None
        
        try:
            if media_type == 'movie':
                verified, data = self.seerr_api.verify_movie(media_info.title, media_info.year, self.match_threshold)
                if verified and data:
                    source = data.get('source', 'unknown')
                    match_score = data.get('match_score', 0)
                    self.logger.debug(f"✓ Verified movie via {source}: {media_info.title} ({media_info.year}) - Score: {match_score:.2f}")
                    
                    # If from a request, log the request status
                    if source == 'seerr_request':
                        status = data.get('request_status', 0)
                        status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                        self.logger.debug(f"  Request status: {status_str}")
                    
                    return True, data
            elif media_type == 'tv':
                verified, data = self.seerr_api.verify_tv(media_info.title, self.match_threshold)
                if verified and data:
                    source = data.get('source', 'unknown')
                    match_score = data.get('match_score', 0)
                    self.logger.debug(f"✓ Verified TV show via {source}: {media_info.title} - Score: {match_score:.2f}")
                    
                    if source == 'seerr_request':
                        status = data.get('request_status', 0)
                        status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                        self.logger.debug(f"  Request status: {status_str}")
                    
                    return True, data
        except Exception as e:
            self.logger.debug(f"Seerr verification failed: {e}")
        
        return False, None
    
    def rename_movie(self, filepath: Path, dry_run: bool = False) -> Optional[Path]:
        """Rename movie file to Jellyfin format"""
        start_time = time.time()
        
        # Skip samples
        if self.skip_samples and is_sample_file(filepath, self.min_file_size_mb):
            self.logger.debug(f"Skipping sample file: {filepath.name}")
            return None
        
        filename = filepath.stem
        extension = filepath.suffix
        directory = filepath.parent
        
        # Parse movie info
        media_info = self.parser.extract_movie_info(filename)
        
        # Verify with Seerr if enabled
        seerr_data = None
        if self.seerr_api:
            verified, seerr_data = self.verify_with_seerr(media_info, 'movie')
            if verified and seerr_data:
                # Update info from Seerr
                media_info.title = seerr_data.get('title', media_info.title)
                if seerr_data.get('release_date'):
                    media_info.year = seerr_data['release_date'][:4]
                media_info.verified = True
                media_info.tmdb_id = seerr_data.get('id')
        
        # Generate new filename
        if media_info.year:
            new_name = f"{media_info.title} ({media_info.year}){extension}"
        else:
            new_name = f"{media_info.title}{extension}"
        
        new_path = directory / new_name
        
        # Check if already correctly named
        is_malformed = (
            re.search(r'\(\s*\(', filename) or
            re.search(r'\s+[a-z]\s+', filename) or
            re.search(r'\s+[a-z]$', filename)
        )
        
        if filepath.name == new_name and not is_malformed:
            elapsed = (time.time() - start_time) * 1000
            self.logger.info(f"  {colored('○', Colors.OKCYAN)} {filepath.name} "
                           f"{colored('[already correct]', Colors.DIM)} "
                           f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
            return new_path
        
        # Resolve conflicts
        resolved_path = ConflictResolver.resolve(new_path, self.conflict_resolution)
        if resolved_path is None:
            self.logger.warning(f"  {colored('⊗', Colors.WARNING)} {filepath.name} "
                              f"{colored('[conflict - skipped]', Colors.WARNING)}")
            return None
        
        elapsed = (time.time() - start_time) * 1000
        
        # Find subtitles
        subtitles = []
        if self.handle_subtitles:
            subtitles = self.subtitle_handler.find_subtitles(filepath)
        
        if dry_run:
            self.logger.info(f"  {colored('→', Colors.WARNING)} {filepath.name}")
            self.logger.info(f"    {colored('➜', Colors.OKGREEN)} {resolved_path.name} "
                           f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
            if media_info.verified and seerr_data:
                source = seerr_data.get('source', '')
                match_score = seerr_data.get('match_score', 0)
                status_icon = '🎬' if source == 'seerr_request' else '🔍'
                self.logger.info(f"    {colored(f'{status_icon} Seerr verified ({source}, score: {match_score:.2f})', Colors.OKGREEN)}")
                if source == 'seerr_request':
                    status = seerr_data.get('request_status', 0)
                    status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                    self.logger.info(f"    {colored(f'📋 Request: {status_str}', Colors.OKCYAN)}")
            if subtitles:
                self.logger.info(f"    {colored(f'📝 {len(subtitles)} subtitle(s) found', Colors.OKCYAN)}")
            return resolved_path
        else:
            try:
                # Rename video file
                os.rename(filepath, resolved_path)
                
                # Log operation
                operation = RenameOperation(
                    timestamp=datetime.now().isoformat(),
                    old_path=str(filepath),
                    new_path=str(resolved_path),
                    operation_type='file',
                    media_type='movie',
                    success=True
                )
                self.operation_log.add_operation(operation)
                
                self.logger.info(f"  {colored('✓', Colors.OKGREEN)} {filepath.name}")
                self.logger.info(f"    {colored('➜', Colors.OKGREEN)} {resolved_path.name} "
                               f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
                
                if media_info.verified and seerr_data:
                    source = seerr_data.get('source', '')
                    match_score = seerr_data.get('match_score', 0)
                    status_icon = '🎬' if source == 'seerr_request' else '🔍'
                    self.logger.info(f"    {colored(f'{status_icon} Seerr verified ({source}, score: {match_score:.2f})', Colors.OKGREEN)}")
                    if source == 'seerr_request':
                        status = seerr_data.get('request_status', 0)
                        status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                        self.logger.info(f"    {colored(f'📋 Request: {status_str}', Colors.OKCYAN)}")
                
                # Rename subtitles
                if subtitles:
                    renamed_subs = self.subtitle_handler.rename_subtitles(
                        filepath, resolved_path, subtitles, self.logger
                    )
                    if renamed_subs:
                        self.logger.info(f"    {colored(f'📝 Renamed {len(renamed_subs)} subtitle(s)', Colors.OKGREEN)}")
                
                # Generate NFO if enabled
                if self.generate_nfo:
                    nfo_content = self.nfo_generator.generate_movie_nfo(media_info, seerr_data)
                    nfo_path = resolved_path.with_suffix('.nfo')
                    nfo_path.write_text(nfo_content, encoding='utf-8')
                    self.logger.info(f"    {colored('📄 Generated NFO file', Colors.OKGREEN)}")
                
                return resolved_path
                
            except Exception as e:
                self.logger.error(f"  {colored('✗', Colors.FAIL)} {filepath.name}")
                self.logger.error(f"    {colored(f'Error: {e}', Colors.FAIL)}")
                
                # Log failed operation
                operation = RenameOperation(
                    timestamp=datetime.now().isoformat(),
                    old_path=str(filepath),
                    new_path=str(resolved_path),
                    operation_type='file',
                    media_type='movie',
                    success=False,
                    error=str(e)
                )
                self.operation_log.add_operation(operation)
                
                return None
    
    def rename_tv_show(self, filepath: Path, dry_run: bool = False) -> Optional[Path]:
        """Rename TV show file to Jellyfin format"""
        start_time = time.time()
        
        # Skip samples
        if self.skip_samples and is_sample_file(filepath, self.min_file_size_mb):
            self.logger.debug(f"Skipping sample file: {filepath.name}")
            return None
        
        filename = filepath.stem
        extension = filepath.suffix
        directory = filepath.parent
        
        # Parse TV info
        media_info = self.parser.extract_tv_info(filename)
        
        if not media_info.season or not media_info.episode:
            elapsed = (time.time() - start_time) * 1000
            self.logger.error(f"  {colored('✗', Colors.FAIL)} {filepath.name}")
            self.logger.error(f"    {colored('Could not parse TV show info', Colors.FAIL)} "
                            f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
            return None
        
        # Verify with Seerr if enabled
        seerr_data = None
        if self.seerr_api:
            verified, seerr_data = self.verify_with_seerr(media_info, 'tv')
            if verified and seerr_data:
                media_info.title = seerr_data.get('name', media_info.title)
                media_info.verified = True
                media_info.tmdb_id = seerr_data.get('id')
        
        # Generate new filename
        new_name = f"{media_info.title} S{media_info.season:02d}E{media_info.episode:02d}{extension}"
        new_path = directory / new_name
        
        # Check if already correctly named
        if filepath.name == new_name:
            elapsed = (time.time() - start_time) * 1000
            self.logger.info(f"  {colored('○', Colors.OKCYAN)} {filepath.name} "
                           f"{colored('[already correct]', Colors.DIM)} "
                           f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
            return new_path
        
        # Resolve conflicts
        resolved_path = ConflictResolver.resolve(new_path, self.conflict_resolution)
        if resolved_path is None:
            self.logger.warning(f"  {colored('⊗', Colors.WARNING)} {filepath.name} "
                              f"{colored('[conflict - skipped]', Colors.WARNING)}")
            return None
        
        elapsed = (time.time() - start_time) * 1000
        
        # Find subtitles
        subtitles = []
        if self.handle_subtitles:
            subtitles = self.subtitle_handler.find_subtitles(filepath)
        
        if dry_run:
            self.logger.info(f"  {colored('→', Colors.WARNING)} {filepath.name}")
            self.logger.info(f"    {colored('➜', Colors.OKGREEN)} {resolved_path.name} "
                           f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
            if media_info.verified and seerr_data:
                source = seerr_data.get('source', '')
                match_score = seerr_data.get('match_score', 0)
                status_icon = '📺' if source == 'seerr_request' else '🔍'
                self.logger.info(f"    {colored(f'{status_icon} Seerr verified ({source}, score: {match_score:.2f})', Colors.OKGREEN)}")
                if source == 'seerr_request':
                    status = seerr_data.get('request_status', 0)
                    status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                    self.logger.info(f"    {colored(f'📋 Request: {status_str}', Colors.OKCYAN)}")
            if subtitles:
                self.logger.info(f"    {colored(f'📝 {len(subtitles)} subtitle(s) found', Colors.DIM)}")
            return resolved_path
        else:
            try:
                # Rename video file
                os.rename(filepath, resolved_path)
                
                # Log operation
                operation = RenameOperation(
                    timestamp=datetime.now().isoformat(),
                    old_path=str(filepath),
                    new_path=str(resolved_path),
                    operation_type='file',
                    media_type='tv',
                    success=True
                )
                self.operation_log.add_operation(operation)
                
                self.logger.info(f"  {colored('✓', Colors.OKGREEN)} {filepath.name}")
                self.logger.info(f"    {colored('➜', Colors.OKGREEN)} {resolved_path.name} "
                               f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
                
                if media_info.verified and seerr_data:
                    source = seerr_data.get('source', '')
                    match_score = seerr_data.get('match_score', 0)
                    status_icon = '📺' if source == 'seerr_request' else '🔍'
                    self.logger.info(f"    {colored(f'{status_icon} Seerr verified ({source}, score: {match_score:.2f})', Colors.OKGREEN)}")
                    if source == 'seerr_request':
                        status = seerr_data.get('request_status', 0)
                        status_str = {1: 'Pending', 2: 'Approved', 3: 'Available'}.get(status, 'Unknown')
                        self.logger.info(f"    {colored(f'📋 Request: {status_str}', Colors.OKCYAN)}")
                
                # Rename subtitles
                if subtitles:
                    renamed_subs = self.subtitle_handler.rename_subtitles(
                        filepath, resolved_path, subtitles, self.logger
                    )
                    if renamed_subs:
                        self.logger.info(f"    {colored(f'📝 Renamed {len(renamed_subs)} subtitle(s)', Colors.OKGREEN)}")
                
                return resolved_path
                
            except Exception as e:
                self.logger.error(f"  {colored('✗', Colors.FAIL)} {filepath.name}")
                self.logger.error(f"    {colored(f'Error: {e}', Colors.FAIL)}")
                
                # Log failed operation
                operation = RenameOperation(
                    timestamp=datetime.now().isoformat(),
                    old_path=str(filepath),
                    new_path=str(resolved_path),
                    operation_type='file',
                    media_type='tv',
                    success=False,
                    error=str(e)
                )
                self.operation_log.add_operation(operation)
                
                return None

def process_directory(directory: str, media_type: str = 'auto', dry_run: bool = False,
                     rename_folders: bool = True, config: Config = None, 
                     interactive: bool = False, max_workers: int = 4,
                     logger: Logger = None) -> Dict[str, int]:
    """Process all video files in a directory"""
    total_start_time = time.time()
    
    if config is None:
        config = Config()
    
    if logger is None:
        logger = Logger(config)
    
    path = Path(directory)
    if not path.exists():
        logger.error(f"✗ Error: Directory '{directory}' does not exist")
        return {}
    
    # Validate path
    if not validate_path(directory, path):
        logger.error(f"✗ Error: Invalid directory path")
        return {}
    
    # Initialize Seerr API if configured
    seerr_api = None
    if config.getboolean('seerr', 'enabled'):
        api_key = config.get('seerr', 'api_key')
        if api_key:
            base_url = config.get('seerr', 'base_url', 'http://localhost:5055')
            seerr_type = config.get('seerr', 'type', 'overseerr')
            seerr_api = SeerrAPI(api_key, base_url, seerr_type)
            logger.info(f"{colored('✓', Colors.OKGREEN)} Seerr API enabled ({seerr_type})")
            
            # Get and display request stats
            try:
                stats = seerr_api.get_request_stats()
                logger.info(f"{colored('📊 Seerr Requests:', Colors.BOLD)} {stats['total']} total "
                          f"({stats['movies']} movies, {stats['tv']} TV shows)")
                logger.info(f"   Pending: {stats['pending']}, Approved: {stats['approved']}, "
                          f"Available: {stats['available']}")
            except Exception as e:
                logger.warning(f"{colored('⚠', Colors.WARNING)} Could not fetch Seerr stats: {e}")
        else:
            logger.warning(f"{colored('⚠', Colors.WARNING)} Seerr enabled but no API key provided")
    
    # Initialize operation log
    log_dir = Path(config.get('logging', 'log_dir', './logs'))
    operation_log = OperationLog(log_dir)
    
    # Initialize renamer
    renamer = MediaRenamer(config, logger, operation_log, seerr_api)
    
    # Print header
    print_header(f"JELLYFIN FILE RENAMER - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"{colored('Directory:', Colors.BOLD)} {path.absolute()}")
    logger.info(f"{colored('Mode:', Colors.BOLD)} {media_type.upper()}")
    logger.info(f"{colored('Dry Run:', Colors.BOLD)} "
               f"{colored('YES', Colors.WARNING) if dry_run else colored('NO', Colors.OKGREEN)}")
    logger.info(f"{colored('Workers:', Colors.BOLD)} {max_workers}")
    
    # Find video files
    video_files = [f for f in path.rglob('*') 
                  if f.suffix.lower() in MediaRenamer.VIDEO_EXTENSIONS and f.is_file()]
    
    if not video_files:
        logger.warning(f"\n{colored('✗', Colors.WARNING)} No video files found in directory")
        return {}
    
    logger.info(f"\n{colored('Found:', Colors.BOLD)} {len(video_files)} video file(s)")
    
    # Statistics
    stats = {
        'renamed': 0,
        'skipped': 0,
        'to_rename': 0,
        'errors': 0,
        'folders_renamed': 0,
        'folders_skipped': 0,
        'folders_to_rename': 0,
        'folder_errors': 0,
        'verified': 0,
        'samples_skipped': 0
    }
    
    # Interactive mode
    if interactive and not dry_run:
        logger.info(f"\n{colored('Interactive mode:', Colors.BOLD)} You will be asked to confirm each rename")
        response = input(f"\nProceed? (y/n): ").lower()
        if response != 'y':
            logger.info("Operation cancelled")
            return stats
    
    # Process files
    print_header("PROCESSING FILES")
    
    folders_to_rename = {}
    files_by_folder = {}
    folder_original_names = {}
    
    # Progress bar setup
    if HAS_TQDM and not logger.verbose:
        pbar = tqdm(total=len(video_files), desc="Processing", unit="file")
    else:
        pbar = None
    
    def process_file(filepath):
        """Process a single file"""
        nonlocal stats
        
        filepath = Path(filepath)
        filename = filepath.stem
        
        # Store original folder name
        if filepath.parent != path:
            folder_original_names[filepath.parent] = filepath.parent.name
        
        # Auto-detect media type
        if media_type == 'auto':
            tv_info = renamer.parser.extract_tv_info(filename)
            current_type = 'tv' if tv_info.title and tv_info.season else 'movie'
        else:
            current_type = media_type
        
        # Rename file
        if current_type == 'movie':
            new_filepath = renamer.rename_movie(filepath, dry_run)
        else:
            new_filepath = renamer.rename_tv_show(filepath, dry_run)
        
        # Update stats
        if new_filepath:
            if new_filepath == filepath or str(new_filepath) == str(filepath):
                stats['skipped'] += 1
            elif dry_run:
                stats['to_rename'] += 1
            else:
                stats['renamed'] += 1
            
            # Track folders
            if rename_folders and filepath.parent != path:
                if filepath.parent not in files_by_folder:
                    files_by_folder[filepath.parent] = []
                files_by_folder[filepath.parent].append((filepath.stem, current_type))
        else:
            stats['errors'] += 1
        
        if pbar:
            pbar.update(1)
    
    # Process files (parallel or sequential)
    if max_workers > 1:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(process_file, f) for f in video_files]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Error processing file: {e}")
                    stats['errors'] += 1
    else:
        for filepath in video_files:
            process_file(filepath)
    
    if pbar:
        pbar.close()
    
    # Determine folder names
    for folder, file_list in files_by_folder.items():
        if not file_list:
            continue
        
        original_folder_name = folder_original_names.get(folder, folder.name)
        
        if file_list[0][1] == 'movie':
            media_info = renamer.parser.extract_movie_info(original_folder_name)
            if media_info.year:
                new_folder_name = f"{media_info.title} ({media_info.year})"
            else:
                new_folder_name = media_info.title
        else:  # TV
            media_info = renamer.parser.extract_tv_info(original_folder_name)
            if media_info.title:
                new_folder_name = media_info.title
            else:
                continue
        
        folders_to_rename[folder] = (new_folder_name, file_list[0][1])
    
    # Rename folders
    if rename_folders and folders_to_rename:
        print_header("PROCESSING FOLDERS")
        
        for old_folder, (new_name, media_type_folder) in folders_to_rename.items():
            start_time = time.time()
            new_folder = old_folder.parent / new_name
            
            # Check if already correct
            if old_folder.name == new_name:
                elapsed = (time.time() - start_time) * 1000
                logger.info(f"  {colored('○', Colors.OKCYAN)} {old_folder.name} "
                          f"{colored('[already correct]', Colors.DIM)} "
                          f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
                stats['folders_skipped'] += 1
                continue
            
            elapsed = (time.time() - start_time) * 1000
            
            if dry_run:
                logger.info(f"  {colored('→', Colors.WARNING)} {old_folder.name}")
                logger.info(f"    {colored('➜', Colors.OKGREEN)} {new_name} "
                          f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
                stats['folders_to_rename'] += 1
            else:
                try:
                    os.rename(old_folder, new_folder)
                    
                    # Log operation
                    operation = RenameOperation(
                        timestamp=datetime.now().isoformat(),
                        old_path=str(old_folder),
                        new_path=str(new_folder),
                        operation_type='folder',
                        media_type=media_type_folder,
                        success=True
                    )
                    operation_log.add_operation(operation)
                    
                    logger.info(f"  {colored('✓', Colors.OKGREEN)} {old_folder.name}")
                    logger.info(f"    {colored('➜', Colors.OKGREEN)} {new_name} "
                              f"{colored(f'({elapsed:.1f}ms)', Colors.DIM)}")
                    stats['folders_renamed'] += 1
                except Exception as e:
                    logger.error(f"  {colored('✗', Colors.FAIL)} {old_folder.name}")
                    logger.error(f"    {colored(f'Error: {e}', Colors.FAIL)}")
                    stats['folder_errors'] += 1
                    
                    # Log failed operation
                    operation = RenameOperation(
                        timestamp=datetime.now().isoformat(),
                        old_path=str(old_folder),
                        new_path=str(new_folder),
                        operation_type='folder',
                        media_type=media_type_folder,
                        success=False,
                        error=str(e)
                    )
                    operation_log.add_operation(operation)
    
    # Print summary
    total_time = time.time() - total_start_time
    print_header("SUMMARY")
    
    if dry_run:
        logger.info(f"{colored('Files to rename:', Colors.BOLD)} {stats['to_rename']}")
        logger.info(f"{colored('Files already correct:', Colors.BOLD)} {stats['skipped']}")
        logger.info(f"{colored('Files with errors:', Colors.BOLD)} {stats['errors']}")
        if rename_folders:
            logger.info(f"{colored('Folders to rename:', Colors.BOLD)} {stats['folders_to_rename']}")
            logger.info(f"{colored('Folders already correct:', Colors.BOLD)} {stats['folders_skipped']}")
    else:
        logger.info(f"{colored('Files renamed:', Colors.OKGREEN)} {stats['renamed']}")
        logger.info(f"{colored('Files skipped:', Colors.OKCYAN)} {stats['skipped']}")
        logger.info(f"{colored('Files with errors:', Colors.FAIL)} {stats['errors']}")
        if rename_folders:
            logger.info(f"{colored('Folders renamed:', Colors.OKGREEN)} {stats['folders_renamed']}")
            logger.info(f"{colored('Folders skipped:', Colors.OKCYAN)} {stats['folders_skipped']}")
            logger.info(f"{colored('Folder errors:', Colors.FAIL)} {stats['folder_errors']}")
        
        logger.info(f"\n{colored('Operation log:', Colors.BOLD)} {operation_log.current_log_file}")
    
    logger.info(f"\n{colored('Total time:', Colors.BOLD)} {total_time:.2f}s")
    if len(video_files) > 0:
        logger.info(f"{colored('Average per file:', Colors.BOLD)} {(total_time / len(video_files) * 1000):.1f}ms\n")
    
    return stats

def undo_last_operation(config: Config, logger: Logger):
    """Undo the last rename operation"""
    log_dir = Path(config.get('logging', 'log_dir', './logs'))
    
    if not log_dir.exists():
        logger.error("No operation logs found")
        return
    
    # Find most recent log
    log_files = sorted(log_dir.glob('operations_*.json'), reverse=True)
    
    if not log_files:
        logger.error("No operation logs found")
        return
    
    latest_log = log_files[0]
    logger.info(f"Loading operations from: {latest_log}")
    
    try:
        operations = OperationLog.load_log(latest_log)
        logger.info(f"Found {len(operations)} operations to undo")
        
        response = input(f"\nUndo {len(operations)} operations? (y/n): ").lower()
        if response != 'y':
            logger.info("Undo cancelled")
            return
        
        # Create temporary log for undo operations
        temp_log = OperationLog(log_dir)
        
        success_count = 0
        error_count = 0
        
        # Reverse order (folders before files)
        for operation in reversed(operations):
            if not operation.success:
                continue
            
            old_path = Path(operation.old_path)
            new_path = Path(operation.new_path)
            
            if not new_path.exists():
                logger.warning(f"Cannot undo: {new_path} does not exist")
                error_count += 1
                continue
            
            if old_path.exists():
                logger.warning(f"Cannot undo: {old_path} already exists")
                error_count += 1
                continue
            
            try:
                os.rename(new_path, old_path)
                logger.info(f"✓ Undone: {new_path.name} → {old_path.name}")
                success_count += 1
            except Exception as e:
                logger.error(f"✗ Failed to undo {new_path.name}: {e}")
                error_count += 1
        
        logger.info(f"\n{colored('Undo complete:', Colors.BOLD)}")
        logger.info(f"  {colored('Success:', Colors.OKGREEN)} {success_count}")
        logger.info(f"  {colored('Errors:', Colors.FAIL)} {error_count}")
        
    except Exception as e:
        logger.error(f"Error loading operation log: {e}")

def generate_config_file(config_path: Path):
    """Generate a default configuration file"""
    config = Config(config_path)
    config.save()
    print(f"{colored('✓', Colors.OKGREEN)} Configuration file created: {config_path}")
    print(f"\n{colored('Configuration file created successfully!', Colors.BOLD)}")
    print(f"\n{colored('Next steps:', Colors.BOLD)}")
    print(f"  1. Edit the config file: {colored(str(config_path), Colors.OKCYAN)}")
    print(f"  2. Add your Seerr API key (if using Overseerr/Jellyseerr)")
    print(f"  3. Customize processing options and patterns")
    print(f"\n{colored('Key sections to configure:', Colors.BOLD)}")
    print(f"  {colored('[seerr]', Colors.OKGREEN)}        - API integration settings")
    print(f"  {colored('[processing]', Colors.OKGREEN)}   - Worker count, file size limits")
    print(f"  {colored('[renaming]', Colors.OKGREEN)}     - Conflict resolution strategy")
    print(f"  {colored('[patterns]', Colors.OKGREEN)}     - Custom cleaning patterns")
    print(f"  {colored('[logging]', Colors.OKGREEN)}      - Log level and directory")

def main():
    parser = argparse.ArgumentParser(
        description='Jellyfin Media File Renamer',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # Positional arguments
    parser.add_argument(
        'directory',
        nargs='?',
        help='Directory containing video files to rename'
    )
    
    # Media type options
    media_group = parser.add_argument_group('Media Type Options')
    media_group.add_argument(
        '--type', '-t',
        choices=['movie', 'tv', 'auto'],
        default='auto',
        help='Media type: movie, tv, or auto-detect (default: auto)'
    )
    
    # Processing options
    processing_group = parser.add_argument_group('Processing Options')
    processing_group.add_argument(
        '--dry-run', '-d',
        action='store_true',
        help='Preview changes without actually renaming files'
    )
    processing_group.add_argument(
        '--workers', '-w',
        type=int,
        default=4,
        help='Number of parallel workers (default: 4)'
    )
    processing_group.add_argument(
        '--no-rename-folders',
        action='store_true',
        help='Rename files only, skip folder renaming'
    )
    processing_group.add_argument(
        '--interactive', '-i',
        action='store_true',
        help='Ask for confirmation before each rename'
    )
    processing_group.add_argument(
        '--recommend',
        action='store_true',
        help='Show system-specific worker recommendations and exit'
    )
    processing_group.add_argument(
        '--verbose', '-v',
        action='store_true',
        default=False,
        help='Verbose output (debugging)'
    )
    processing_group.add_argument(
        '--quiet', '-q',
        action='store_true',
        default=False,
        help='Quiet mode (minimal output)'
    )
    
    # Configuration options
    config_group = parser.add_argument_group('Configuration Options')
    config_group.add_argument(
        '--config', '-c',
        type=Path,
        help='Path to custom configuration file'
    )
    config_group.add_argument(
        '--generate-config',
        action='store_true',
        help='Generate default configuration file and exit'
    )
    config_group.add_argument(
        '--undo',
        action='store_true',
        help='Undo the last rename operation'
    )
    config_group.add_argument(
        '--json-output',
        action='store_true',
        help='Output statistics in JSON format'
    )
    
    args = parser.parse_args()
    
    # Load configuration
    config = Config(args.config)
    
    # Initialize logger
    logger = Logger(config, verbose=args.verbose, quiet=args.quiet)
    
    try:
        # Handle special commands
        if args.recommend:
            print_system_recommendations()
            return
        
        if args.generate_config:
            config_path = args.config or Path.home() / '.jellyfin_renamer.ini'
            generate_config_file(config_path)
            return
        
        if args.undo:
            undo_last_operation(config, logger)
            return
        
        # Validate directory argument
        if not args.directory:
            parser.print_help()
            return
        
        # Process directory
        stats = process_directory(
            args.directory,
            args.type,
            args.dry_run,
            rename_folders=not args.no_rename_folders,
            config=config,
            interactive=args.interactive,
            max_workers=args.workers,
            logger=logger
        )
        
        # JSON output
        if args.json_output:
            print(json.dumps(stats, indent=2))
        
    except KeyboardInterrupt:
        logger.info("\n\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.critical(f"\nUnexpected error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()